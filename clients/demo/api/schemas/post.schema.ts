export const postSchema = {
  type: 'object',
  required: ['userId', 'id', 'title', 'body'],
  additionalProperties: false,
  properties: {
    userId: { type: 'integer', minimum: 1 },
    id: { type: 'integer', minimum: 1 },
    title: { type: 'string', minLength: 1 },
    body: { type: 'string' },
  },
} as const;

export const postListSchema = {
  type: 'array',
  items: postSchema,
} as const;

export interface Post {
  userId: number;
  id: number;
  title: string;
  body: string;
}
