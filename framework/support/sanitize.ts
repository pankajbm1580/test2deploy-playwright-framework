import { MASK, maskHeaderLines, redact, redactCookies } from './redact';

/**
 * Redaction for API call diagnostics. Everything recorded about a request or response goes
 * through these functions before it is kept, so nothing sensitive reaches an attachment.
 *
 * Rules fail closed: a body whose format cannot be safely inspected (HTML, XML, multipart,
 * binary, invalid JSON, anything unknown) is omitted, and any error while redacting omits
 * the affected value. Name-based rules deliberately over-match (e.g. "author" matches "auth"):
 * an unneeded mask costs a little debugging detail, a missed one leaks a secret.
 */

/** Maximum size, in bytes, of each recorded request or response body (and error message). */
export const BODY_LIMIT = 10 * 1024;

const SENSITIVE_NAME = /passw(?:or)?d|passwd|pwd|secret|token|api[-_]?key|apikey|auth|cookie|session|credential|private[-_]?key|access[-_]?key|signature|otp|csrf|xsrf/i;
const SENSITIVE_HEADER = new RegExp(`${SENSITIVE_NAME.source}|^key$|-key$`, 'i');
const SENSITIVE_QUERY = new RegExp(`${SENSITIVE_NAME.source}|^code$|^sig$|^key$`, 'i');

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE_HEADER.test(name);
}

export function isSensitiveKey(name: string): boolean {
  return SENSITIVE_NAME.test(name);
}

export function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    result[name.toLowerCase()] = isSensitiveHeader(name) ? MASK : String(value);
  }
  return result;
}

/** Drops credentials in the URL and masks sensitive query parameters. Unparseable URLs are omitted. */
export function sanitizeUrl(url: string, baseURL?: string): string {
  try {
    const parsed = new URL(url, baseURL);
    parsed.username = '';
    parsed.password = '';
    for (const name of [...new Set(parsed.searchParams.keys())]) {
      if (SENSITIVE_QUERY.test(name)) parsed.searchParams.set(name, MASK);
    }
    // URLSearchParams encodes "*" as %2A; show the mask as written.
    return parsed.toString().split('%2A%2A%2A').join(MASK);
  } catch {
    return '<url omitted: could not be parsed for redaction>';
  }
}

/**
 * Masks values of sensitive keys at any depth of parsed JSON. String values also get the
 * text rules, since they can embed serialized data (e.g. an echoed '{"password":"..."}').
 */
export function redactJson(value: unknown): unknown {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactJson);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, inner]) => [key, isSensitiveKey(key) ? MASK : redactJson(inner)]),
    );
  }
  return value;
}

// Values stop at whitespace, quotes, separators and colour codes (so trailing codes survive).
const AUTH_SCHEME = /\b(bearer|basic|digest)(\s+)[^\s"',;\u001b]+/gi;
const TOKEN_SCHEME = /\b(token)(\s+)[^\s"',;\u001b]+/gi;
const SENSITIVE_PAIR = new RegExp(`((?:${SENSITIVE_NAME.source})[\\w-]*["']?\\s*[=:]\\s*["']?)[^\\s"'&,;\\u001b]+`, 'gi');

/**
 * Header lines with a sensitive name ("authorization: ...", "cookie: a=b; c=d") are masked
 * whole; cookie values anywhere are masked to the end of the line (redactCookies); then auth
 * schemes and sensitive key=value pairs.
 */
function applyTextRules(text: string, { tokenScheme }: { tokenScheme: boolean }): string {
  let result = redactCookies(maskHeaderLines(text, isSensitiveHeader));
  result = result.replace(AUTH_SCHEME, `$1$2${MASK}`);
  if (tokenScheme) result = result.replace(TOKEN_SCHEME, `$1$2${MASK}`);
  return result.replace(SENSITIVE_PAIR, `$1${MASK}`);
}

const longestFirst = (secrets: readonly string[]) => [...secrets].sort((a, b) => b.length - a.length);

// Terminal colour/style codes. Removed from attachment text, which is read as plain JSON.
const ANSI_CODES = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b[@-_]/g;

/** Pattern-based redaction for plain text and error messages in attachments. */
export function redactText(text: string, secrets: readonly string[] = []): string {
  return applyTextRules(redact(text, longestFirst(secrets)).replace(ANSI_CODES, ''), { tokenScheme: true });
}

/**
 * Redaction for text Playwright puts in reports (test and step errors, step titles, stdout).
 * Same rules as attachments, but colour codes are kept for display, and "token <x>" is left
 * alone: report text is mostly error messages such as "Unexpected token <".
 */
export function redactReportText(text: string, secrets: readonly string[] = []): string {
  return applyTextRules(redact(text, longestFirst(secrets)), { tokenScheme: false });
}

/** A request path or URL for labels and messages: sensitive query parameters masked, origin kept only if given. */
export function sanitizePath(pathOrUrl: string): string {
  const placeholder = 'http://path.invalid';
  const sanitized = sanitizeUrl(pathOrUrl, placeholder);
  return sanitized.startsWith(`${placeholder}/`) && !pathOrUrl.startsWith(placeholder) ? sanitized.slice(placeholder.length) : sanitized;
}

/** Cuts text to BODY_LIMIT bytes (after redaction, so a cut never exposes part of a secret). */
export function truncate(text: string, limit = BODY_LIMIT): { text: string; truncated: boolean } {
  const bytes = Buffer.from(text, 'utf8');
  if (bytes.length <= limit) return { text, truncated: false };
  return { text: `${bytes.subarray(0, limit).toString('utf8')}…[truncated, ${bytes.length} bytes total]`, truncated: true };
}

export interface SanitizedBody {
  contentType?: string;
  size: number;
  body?: unknown;
  truncated?: true;
  omitted?: string;
}

type BodyFormat = 'json' | 'form' | 'text' | 'uninspectable';

function formatOf(contentType: string | undefined): BodyFormat {
  const type = (contentType ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'application/json' || type.endsWith('+json')) return 'json';
  if (type === 'application/x-www-form-urlencoded') return 'form';
  if (type === 'text/plain') return 'text';
  return 'uninspectable';
}

function omitted(contentType: string | undefined, size: number, reason: string): SanitizedBody {
  return { ...(contentType ? { contentType } : {}), size, omitted: reason };
}

/**
 * Redacts and caps a body. Only JSON, URL-encoded forms and plain text are inspected;
 * anything else, and anything that fails to redact, is omitted with its size and a reason.
 */
export function sanitizeBody(raw: Buffer | string | undefined, contentType: string | undefined, secrets: readonly string[] = []): SanitizedBody {
  if (raw === undefined) return { size: 0 };
  const buffer = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw;
  const size = buffer.length;
  if (size === 0) return { ...(contentType ? { contentType } : {}), size };

  const format = formatOf(contentType);
  if (format === 'uninspectable') {
    return omitted(contentType, size, `body omitted: content type "${contentType ?? 'unknown'}" is not inspected for secrets`);
  }

  try {
    const text = buffer.toString('utf8');
    let redacted: string;
    let parsed: unknown;
    if (format === 'json') {
      try {
        parsed = redactJson(JSON.parse(text));
      } catch {
        return omitted(contentType, size, 'body omitted: invalid JSON cannot be safely redacted');
      }
      redacted = redact(JSON.stringify(parsed), jsonEscaped(secrets));
      parsed = JSON.parse(redacted);
    } else if (format === 'form') {
      const params = new URLSearchParams(text);
      for (const name of [...new Set(params.keys())]) if (isSensitiveKey(name)) params.set(name, MASK);
      redacted = redactText(params.toString().split('%2A%2A%2A').join(MASK), secrets);
    } else {
      redacted = redactText(text, secrets);
    }

    const { text: capped, truncated } = truncate(redacted);
    const body = truncated || parsed === undefined ? capped : parsed;
    return { ...(contentType ? { contentType } : {}), size, body, ...(truncated ? { truncated: true as const } : {}) };
  } catch {
    return omitted(contentType, size, 'body omitted: redaction failed');
  }
}

/**
 * Each secret as written and as it appears inside a JSON string (quotes, backslashes escaped),
 * longest first so a secret containing another is masked whole.
 */
export function jsonEscaped(secrets: readonly string[]): string[] {
  return secrets.flatMap((secret) => [secret, JSON.stringify(secret).slice(1, -1)]).sort((a, b) => b.length - a.length);
}

/** Redacts and caps an error message (Playwright call logs list request headers). */
export function sanitizeError(message: string, secrets: readonly string[] = []): string {
  try {
    return truncate(redactText(message, secrets)).text;
  } catch {
    return '<error message omitted: redaction failed>';
  }
}
