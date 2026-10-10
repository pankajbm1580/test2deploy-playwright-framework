import { test, expect } from '../fixtures/api-fixtures';
import { postSchema, type Post } from '../schemas/post.schema';

// JSONPlaceholder fakes writes: responses are realistic but nothing is persisted,
// so these tests assert on the write response and never re-read the resource.
test.describe('Write resources', () => {
  test.beforeEach(({ apiEnv }) => {
    test.skip(apiEnv.readOnly, `Write tests are disabled for read-only environment "${apiEnv.name}"`);
  });

  test('POST /posts returns 201 and echoes the new post with an id', async ({ api }) => {
    const payload = { userId: 1, title: 'API automation', body: 'Created by Playwright' };

    const response = await api.post('/posts', { data: payload });

    expect(response.status()).toBe(201);
    const body: Post = await response.json();
    expect(body).toMatchSchema(postSchema);
    expect(body).toEqual({ ...payload, id: expect.any(Number) });
  });

  test('PUT /posts/1 returns 200 and replaces the post', async ({ api }) => {
    const payload = { id: 1, userId: 1, title: 'Replaced title', body: 'Replaced body' };

    const response = await api.put('/posts/1', { data: payload });

    expect(response.status()).toBe(200);
    const body: Post = await response.json();
    expect(body).toMatchSchema(postSchema);
    expect(body).toEqual(payload);
  });

  test('PATCH /posts/1 returns 200 and changes only the patched field', async ({ api }) => {
    const original: Post = await (await api.get('/posts/1')).json();

    const response = await api.patch('/posts/1', { data: { title: 'Patched title' } });

    expect(response.status()).toBe(200);
    const body: Post = await response.json();
    expect(body).toMatchSchema(postSchema);
    expect(body).toEqual({ ...original, title: 'Patched title' });
  });

  test('DELETE /posts/1 returns 200 and an empty body', async ({ api }) => {
    const response = await api.delete('/posts/1');

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({});
  });
});
