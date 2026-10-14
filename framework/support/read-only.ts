import type { APIRequestContext } from '@playwright/test';

const WRITE_METHODS = new Set(['post', 'put', 'patch', 'delete']);
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The HTTP method of a fetch() call, or undefined if it cannot be determined. */
function fetchMethod(urlOrRequest: unknown, options: unknown): string | undefined {
  const fromOptions = (options as { method?: unknown } | undefined)?.method;
  if (typeof fromOptions === 'string') return fromOptions.toUpperCase();
  if (typeof urlOrRequest === 'string') return 'GET';
  const method = (urlOrRequest as { method?: unknown } | undefined)?.method;
  return typeof method === 'function' ? String(method.call(urlOrRequest)).toUpperCase() : undefined;
}

/**
 * Wraps a request context so it rejects write requests (POST, PUT, PATCH, DELETE and any
 * non-read fetch). Used for read-only environments, including every production run, as a
 * safety net behind the test.skip() in write tests. A fetch() whose method cannot be
 * determined is treated as a write: the blocker fails closed.
 */
export function withWritesBlocked<T extends APIRequestContext>(target: T, environmentName: string): T {
  const blocked = (method: string) =>
    Promise.reject(new Error(`Write request blocked: API environment "${environmentName}" is read-only (${method}).`));

  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop, obj);
      if (typeof prop !== 'string' || typeof value !== 'function') return value;
      if (WRITE_METHODS.has(prop)) return () => blocked(prop.toUpperCase());
      if (prop === 'fetch') {
        return (urlOrRequest: unknown, options?: unknown) => {
          const method = fetchMethod(urlOrRequest, options);
          if (method === undefined || !READ_METHODS.has(method)) return blocked(method ?? 'unknown method');
          return (value as (...args: unknown[]) => unknown).call(obj, urlOrRequest, options);
        };
      }
      return value.bind(obj);
    },
  });
}
