import { test, expect } from '../../../../framework/fixtures/api';
import { postSchema, postListSchema, type Post } from '../schemas/post.schema';
import { commentListSchema, type PostComment } from '../schemas/comment.schema';
import { userSchema, type User } from '../schemas/user.schema';

test.describe('Read resources', () => {
  test('GET /posts returns 200 and a list of posts matching the schema', async ({ api }) => {
    const response = await api.get('/posts');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const body: Post[] = await response.json();
    expect(body).toHaveLength(100);
    expect(body).toMatchSchema(postListSchema);
  });

  test('GET /posts/1 returns 200 and the requested post', async ({ api }) => {
    const response = await api.get('/posts/1');

    expect(response.status()).toBe(200);
    const body: Post = await response.json();
    expect(body).toMatchSchema(postSchema);
    expect(body.id).toBe(1);
  });

  test('GET /posts/1/comments returns only comments for post 1', async ({ api }) => {
    const response = await api.get('/posts/1/comments');

    expect(response.status()).toBe(200);
    const body: PostComment[] = await response.json();
    expect(body.length).toBeGreaterThan(0);
    expect(body).toMatchSchema(commentListSchema);
    for (const comment of body) {
      expect(comment.postId).toBe(1);
    }
  });

  test('GET /comments?postId=1 matches the nested comments route', async ({ api }) => {
    const [nested, filtered] = await Promise.all([
      api.get('/posts/1/comments'),
      api.get('/comments', { params: { postId: 1 } }),
    ]);

    expect(nested.status()).toBe(200);
    expect(filtered.status()).toBe(200);
    expect(await filtered.json()).toEqual(await nested.json());
  });

  test('GET /users/1 returns 200 and a user matching the nested schema', async ({ api }) => {
    const response = await api.get('/users/1');

    expect(response.status()).toBe(200);
    const body: User = await response.json();
    expect(body).toMatchSchema(userSchema);
    expect(body.id).toBe(1);
  });
});
