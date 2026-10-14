const nonEmptyString = { type: 'string', minLength: 1 } as const;

export const userSchema = {
  type: 'object',
  required: ['id', 'name', 'username', 'email', 'address', 'phone', 'website', 'company'],
  additionalProperties: false,
  properties: {
    id: { type: 'integer', minimum: 1 },
    name: nonEmptyString,
    username: nonEmptyString,
    email: { type: 'string', format: 'email' },
    address: {
      type: 'object',
      required: ['street', 'suite', 'city', 'zipcode', 'geo'],
      additionalProperties: false,
      properties: {
        street: nonEmptyString,
        suite: nonEmptyString,
        city: nonEmptyString,
        zipcode: nonEmptyString,
        geo: {
          type: 'object',
          required: ['lat', 'lng'],
          additionalProperties: false,
          properties: {
            lat: { type: 'string', pattern: '^-?\\d+(\\.\\d+)?$' },
            lng: { type: 'string', pattern: '^-?\\d+(\\.\\d+)?$' },
          },
        },
      },
    },
    phone: nonEmptyString,
    website: nonEmptyString,
    company: {
      type: 'object',
      required: ['name', 'catchPhrase', 'bs'],
      additionalProperties: false,
      properties: {
        name: nonEmptyString,
        catchPhrase: nonEmptyString,
        bs: nonEmptyString,
      },
    },
  },
} as const;

export interface User {
  id: number;
  name: string;
  username: string;
  email: string;
  address: {
    street: string;
    suite: string;
    city: string;
    zipcode: string;
    geo: { lat: string; lng: string };
  };
  phone: string;
  website: string;
  company: { name: string; catchPhrase: string; bs: string };
}
