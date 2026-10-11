const MASK = '***';

/** Replaces every occurrence of each secret in `text` with a mask. */
export function redact(text: string, secrets: readonly string[]): string {
  return secrets.reduce((result, secret) => result.split(secret).join(MASK), text);
}

function scrub(error: unknown, secrets: readonly string[]): unknown {
  if (error instanceof Error) {
    error.message = redact(error.message, secrets);
    if (error.stack) error.stack = redact(error.stack, secrets);
  }
  return error;
}

/**
 * Wraps an object (e.g. an APIRequestContext) so errors thrown or rejected by its methods
 * have the given secrets masked. Playwright's API error call logs include request headers,
 * so without this an Authorization token would appear in test output and reports.
 */
export function withRedactedErrors<T extends object>(target: T, secrets: readonly (string | undefined)[]): T {
  const active = secrets.filter((secret): secret is string => !!secret);
  if (active.length === 0) return target;

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
