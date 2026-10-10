export const commentSchema = {
  type: 'object',
  required: ['postId', 'id', 'name', 'email', 'body'],
  additionalProperties: false,
  properties: {
    postId: { type: 'integer', minimum: 1 },
    id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 1 },
    email: { type: 'string', format: 'email' },
    body: { type: 'string' },
  },
} as const;

export const commentListSchema = {
  type: 'array',
  items: commentSchema,
} as const;

export interface PostComment {
  postId: number;
  id: number;
  name: string;
  email: string;
  body: string;
}
