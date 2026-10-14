/**
 * Obviously fake secret markers for redaction tests; nothing here is a real credential.
 * Each marker contains FAKE_SECRET_TAG, so one search for the tag finds any leak. They are
 * built at runtime so the full marker never appears in source code, which reports may show
 * as code snippets: a match in a report is then always a real leak, never a quoted line.
 */
export const FAKE_SECRET_TAG = ['marker', String(700 + 89)].join('-');

export const fakeSecret = (kind: string): string => ['fake', kind, FAKE_SECRET_TAG].join('-');

export const fakeSecrets = {
  token: fakeSecret('token'),
  password: fakeSecret('password'),
  cookie: fakeSecret('cookie'),
  session: fakeSecret('session'),
  apiKey: fakeSecret('apikey'),
  accessToken: fakeSecret('access-token'),
};
