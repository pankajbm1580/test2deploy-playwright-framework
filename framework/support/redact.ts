export const MASK = '***';

/** Replaces every occurrence of each secret in `text` with a mask. */
export function redact(text: string, secrets: readonly string[]): string {
  return secrets.reduce((result, secret) => result.split(secret).join(MASK), text);
}

// Terminal colour/style codes, which Playwright puts around each line of its call logs.
const ANSI = '(?:\\u001b\\[[0-9;?]*[ -/]*[@-~])*';
const HEADER_LINE = new RegExp(`^(${ANSI}[ \\t]*-?[ \\t]*${ANSI})([\\w-]+)(${ANSI}:[ \\t]*)(.*?)(${ANSI})$`, 'gm');

/**
 * Masks the whole value of "name: value" lines whose name matches, as Playwright call logs
 * list request headers ("  - cookie: a=b; c=d"). Colour codes around the line are kept.
 */
export function maskHeaderLines(text: string, isSensitive: (name: string) => boolean): string {
  return text.replace(HEADER_LINE, (line, start, name, sep, value, end) =>
    value && isSensitive(name) ? `${start}${name}${sep}${MASK}${end}` : line,
  );
}

const COOKIE_HEADER = /^(?:set-)?cookie2?$/i;
// "cookie=..." / "Set-Cookie: ..." outside header lines: a cookie value holds several
// "name=value;" pairs, so everything to the end of the line (or closing quote) is masked.
const COOKIE_VALUE = /(\b(?:set-)?cookies?2?["']?[ \t]*[=:][ \t]*["']?)[^\n"'\u001b]+/gi;

/**
 * Masks Cookie and Set-Cookie values in text. A request context sends cookies saved from
 * earlier responses on its own, so they appear in error call logs even when no test set them.
 */
export function redactCookies(text: string): string {
  return maskHeaderLines(text, (name) => COOKIE_HEADER.test(name)).replace(COOKIE_VALUE, `$1${MASK}`);
}

function scrub(error: unknown, secrets: readonly string[]): unknown {
  if (error instanceof Error) {
    error.message = redactCookies(redact(error.message, secrets));
    if (error.stack) error.stack = redactCookies(redact(error.stack, secrets));
  }
  return error;
}

/**
 * Wraps an object (e.g. an APIRequestContext) so errors thrown or rejected by its methods
 * have the given secrets and any cookie values masked. Playwright's API error call logs
 * include request headers, so without this an Authorization token or session cookie would
 * appear in test output, test-results and reports.
 */
export function withRedactedErrors<T extends object>(target: T, secrets: readonly (string | undefined)[]): T {
  // Always wrapped, even without secrets: cookies saved by the context can appear in any error.
  const active = secrets.filter((secret): secret is string => !!secret);

  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (typeof value !== 'function') return value;
      const methods = obj as Record<PropertyKey, (...args: unknown[]) => unknown>;
      return (...args: unknown[]) => {
        try {
          // Call as a method (not via .apply) so Playwright's error messages keep the real API name.
          const result = methods[prop](...args);
          return result instanceof Promise
            ? result.catch((error: unknown) => {
                throw scrub(error, active);
              })
            : result;
        } catch (error) {
          throw scrub(error, active);
        }
      };
    },
  });
}
