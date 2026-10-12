import fs from 'node:fs/promises';
import path from 'node:path';
import type { APIRequestContext, APIResponse } from '@playwright/test';
import { redact } from './redact';
import { jsonEscaped, sanitizeBody, sanitizeError, sanitizeHeaders, sanitizeUrl, type SanitizedBody } from './sanitize';

/** How many calls an attachment keeps; older calls are dropped and counted. */
export const CALL_HISTORY_LIMIT = 20;

export interface RecordedCall {
  method: string;
  url: string;
  durationMs: number;
  request: { headers: Record<string, string>; body: SanitizedBody };
  response?: { status: number; statusText: string; headers: Record<string, string>; body: SanitizedBody };
  error?: string;
}

export interface ApiCallRecorderOptions {
  baseURL: string;
  /** Headers the context sends on every request (recorded redacted, like all headers). */
  defaultHeaders?: Record<string, string>;
  /** Known secret values, e.g. API_TOKEN; masked wherever they appear. */
  secrets?: readonly (string | undefined)[];
}

type RequestOptions = {
  data?: unknown;
  form?: unknown;
  multipart?: unknown;
  headers?: Record<string, string>;
  params?: unknown;
  method?: string;
};

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'head']);

type BodyInput = { raw?: Buffer | string; contentType?: string; omit?: string };

const contentTypeOf = (headers: Record<string, string>) =>
  Object.entries(headers).find(([name]) => name.toLowerCase() === 'content-type')?.[1];

/** The body a request will send, as raw bytes plus its content type. */
function requestBody(options: RequestOptions | undefined, headers: Record<string, string>): BodyInput {
  if (!options) return {};
  const declared = contentTypeOf(headers);
  const multipart = { contentType: 'multipart/form-data', omit: 'body omitted: multipart bodies are not inspected for secrets' };
  if (options.multipart !== undefined) return multipart;
  if (options.form !== undefined) {
    const { form } = options;
    if (form instanceof URLSearchParams) return { raw: form.toString(), contentType: 'application/x-www-form-urlencoded' };
    // FormData (possibly with files) is sent as multipart and is not inspected.
    if (typeof form !== 'object' || form === null || form instanceof FormData) return multipart;
    const params = new URLSearchParams(Object.entries(form).map(([k, v]) => [k, String(v)]));
    return { raw: params.toString(), contentType: 'application/x-www-form-urlencoded' };
  }
  const { data } = options;
  if (data === undefined) return {};
  if (Buffer.isBuffer(data)) return { raw: data, contentType: declared ?? 'application/octet-stream' };
  if (typeof data === 'string') return { raw: data, contentType: declared ?? 'text/plain' };
  return { raw: JSON.stringify(data), contentType: declared ?? 'application/json' };
}

/** The URL with `params` applied, as Playwright would send it. */
function withParams(url: string, baseURL: string, params: unknown): string {
  if (params === undefined) return url;
  const resolved = new URL(url, baseURL);
  const entries =
    params instanceof URLSearchParams
      ? [...params.entries()]
      : typeof params === 'string'
        ? [...new URLSearchParams(params).entries()]
        : Object.entries(params as Record<string, unknown>).map(([k, v]) => [k, String(v)] as [string, string]);
  for (const [name, value] of entries) resolved.searchParams.append(name, value);
  return resolved.toString();
}

/**
 * Records the API calls made through a request context, redacted as they are recorded:
 * raw headers and bodies are never kept, only their sanitized form. Keeps the last
 * CALL_HISTORY_LIMIT calls. Recording never changes what the test sees: the original
 * response or error is always returned, even if recording itself fails.
 */
export class ApiCallRecorder {
  private readonly calls: RecordedCall[] = [];
  private total = 0;
  private readonly secrets: string[];

  constructor(private readonly options: ApiCallRecorderOptions) {
    this.secrets = (options.secrets ?? []).filter((secret): secret is string => !!secret);
  }

  get totalCalls(): number {
    return this.total;
  }

  get recordedCalls(): readonly RecordedCall[] {
    return this.calls;
  }

  wrap<T extends APIRequestContext>(target: T): T {
    return new Proxy(target, {
      get: (obj, prop) => {
        const value = Reflect.get(obj, prop, obj);
        if (typeof prop !== 'string' || typeof value !== 'function') return value;
        if (!METHODS.has(prop) && prop !== 'fetch') return value.bind(obj);
        const methods = obj as unknown as Record<string, (...args: unknown[]) => Promise<APIResponse>>;
        return async (urlOrRequest: unknown, options?: RequestOptions) => {
          const started = Date.now();
          // Called as a method so Playwright's error messages keep the real API name.
          const pending = methods[prop](urlOrRequest, options);
          try {
            const response = await pending;
            await this.record(prop, urlOrRequest, options, started, response);
            return response;
          } catch (error) {
            await this.record(prop, urlOrRequest, options, started, undefined, error);
            throw error;
          }
        };
      },
    });
  }

  private async record(
    method: string,
    urlOrRequest: unknown,
    options: RequestOptions | undefined,
    started: number,
    response?: APIResponse,
    error?: unknown,
  ): Promise<void> {
    try {
      this.push(await this.describe(method, urlOrRequest, options, started, response, error));
    } catch {
      this.push({
        method: method.toUpperCase(),
        url: '<omitted: call could not be recorded>',
        durationMs: Date.now() - started,
        request: { headers: {}, body: { size: 0, omitted: 'call could not be recorded' } },
      });
    }
  }

  private async describe(
    method: string,
    urlOrRequest: unknown,
    options: RequestOptions | undefined,
    started: number,
    response?: APIResponse,
    error?: unknown,
  ): Promise<RecordedCall> {
    const durationMs = Date.now() - started;
    let httpMethod = method.toUpperCase();
    let url: string;
    let headers: Record<string, string> = { ...this.options.defaultHeaders, ...options?.headers };
    let body: BodyInput;

    if (typeof urlOrRequest === 'string') {
      if (method === 'fetch') httpMethod = (options?.method ?? 'GET').toUpperCase();
      url = withParams(urlOrRequest, this.options.baseURL, options?.params);
      body = requestBody(options, headers);
    } else {
      // fetch(request): an intercepted Request object.
      const request = urlOrRequest as { method(): string; url(): string; headers(): Record<string, string>; postDataBuffer(): Buffer | null };
      httpMethod = (options?.method ?? request.method()).toUpperCase();
      url = request.url();
      headers = { ...request.headers(), ...options?.headers };
      const overridden = options && (options.data ?? options.form ?? options.multipart) !== undefined;
      body = overridden ? requestBody(options, headers) : { raw: request.postDataBuffer() ?? undefined, contentType: contentTypeOf(headers) };
    }

    const call: RecordedCall = {
      method: httpMethod,
      url: sanitizeUrl(response?.url() ?? url, this.options.baseURL),
      durationMs,
      request: {
        headers: sanitizeHeaders(headers),
        body: body.omit ? { contentType: body.contentType, size: 0, omitted: body.omit } : sanitizeBody(body.raw, body.contentType, this.secrets),
      },
    };

    if (response) {
      const responseHeaders = response.headers();
      let raw: Buffer | undefined;
      let readError: string | undefined;
      try {
        raw = await response.body();
      } catch {
        readError = 'body omitted: response body could not be read';
      }
      call.response = {
        status: response.status(),
        statusText: response.statusText(),
        headers: sanitizeHeaders(responseHeaders),
        body: readError
          ? { size: 0, omitted: readError }
          : sanitizeBody(raw, responseHeaders['content-type'], this.secrets),
      };
    }
    if (error !== undefined) {
      call.error = sanitizeError(error instanceof Error ? error.message : String(error), this.secrets);
    }
    return call;
  }

  private push(call: RecordedCall): void {
    this.total++;
    this.calls.push(call);
    if (this.calls.length > CALL_HISTORY_LIMIT) this.calls.shift();
  }

  /** The attachment body: the recorded calls as JSON, with a final pass masking known secrets. */
  toAttachment(): string {
    const report = {
      note: 'API calls made by this test, redacted. Sensitive headers, fields and parameters are masked; uninspectable bodies are omitted.',
      totalCalls: this.total,
      recordedCalls: this.calls.length,
      droppedCalls: this.total - this.calls.length,
      calls: this.calls,
    };
    return redact(JSON.stringify(report, null, 2), jsonEscaped(this.secrets));
  }
}

/** The parts of TestInfo used to attach calls (a narrow type so it can be tested directly). */
export interface AttachTarget {
  status?: string;
  outputPath(...pathSegments: string[]): string;
  attach(name: string, options: { path: string; contentType: string }): Promise<void>;
}

const FAILED_STATUSES = new Set(['failed', 'timedOut', 'interrupted']);

/**
 * Attaches the recorded calls if the test failed and made any calls. Returns whether it attached.
 * Written as api-calls.json in the test's output folder (test-results), so it is there even
 * when the HTML report is skipped, and attached by path for the reports.
 */
export async function attachApiCalls(testInfo: AttachTarget, recorder: ApiCallRecorder): Promise<boolean> {
  if (!FAILED_STATUSES.has(testInfo.status ?? '') || recorder.totalCalls === 0) return false;
  const file = testInfo.outputPath('api-calls.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, recorder.toAttachment(), 'utf8');
  await testInfo.attach('api-calls', { path: file, contentType: 'application/json' });
  return true;
}
