import { test, expect } from '../../../../framework/fixtures/api';
import { postSchema } from '../schemas/post.schema';

test.describe('Negative scenarios', () => {
  test('GET a post that does not exist returns 404 with an empty body', async ({ api }) => {
    const response = await api.get('/posts/99999');

    expect(response.status()).toBe(404);
    expect(response.ok()).toBe(false);
    expect(await response.json()).toEqual({});
  });

  test('GET a post with a non-numeric id returns 404', async ({ api }) => {
    const response = await api.get('/posts/abc');

    expect(response.status()).toBe(404);
  });

  test('GET an unknown resource returns 404', async ({ api }) => {
    const response = await api.get('/unknown-resource');

    expect(response.status()).toBe(404);
  });

  test('Filtering by a user with no posts returns 200 and an empty list', async ({ api }) => {
    const response = await api.get('/posts', { params: { userId: 99999 } });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual([]);
  });

  test('Schema validation rejects posts with missing, extra or wrongly typed fields', () => {
    const valid = { userId: 1, id: 1, title: 'Title', body: 'Body' };

    expect(valid).toMatchSchema(postSchema);
    expect({ ...valid, id: '1' }).not.toMatchSchema(postSchema);
    expect({ userId: 1, id: 1, title: 'Title' }).not.toMatchSchema(postSchema);
    expect({ ...valid, unexpected: true }).not.toMatchSchema(postSchema);
    expect({ ...valid, title: '' }).not.toMatchSchema(postSchema);
  });
});
