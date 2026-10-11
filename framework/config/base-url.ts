/**
 * Validates a base URL taken from an environment variable.
 *
 * Error messages name the variable and the rule that failed but never echo the supplied
 * value: a credential or token pasted into the variable must not end up in logs or reports.
 * Valid URL paths are preserved; query strings and fragments are rejected because tokens
 * are sometimes passed as ?token=... and base URLs appear in reports and traces.
 */
export function parseBaseUrl(variable: string, value: string, { credentialsHint = '' } = {}): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${variable} is not a valid URL. The value is not shown because it may contain credentials.`);
  }
  if (url.username || url.password) {
    throw new Error(`${variable} must not contain a username or password.${credentialsHint ? ` ${credentialsHint}` : ''}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`${variable} must use http or https.`);
  }
  // A bare "?" or "#" parses to an empty search/hash, so check the raw value too.
  if (url.search || url.hash || /[?#]/.test(value)) {
    throw new Error(`${variable} must not contain a query string or fragment.`);
  }
  return url;
}
