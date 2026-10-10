import Ajv, { type AnySchema } from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

/** Custom matcher: `expect(body).toMatchSchema(schema)`, registered in api/fixtures/api-fixtures.ts. */
export const schemaMatchers = {
  toMatchSchema(received: unknown, schema: AnySchema) {
    const validate = ajv.compile(schema);
    const pass = validate(received) as boolean;
    return {
      pass,
      name: 'toMatchSchema',
      message: () =>
        pass
          ? 'Expected value not to match the JSON schema, but it did.'
          : `Expected value to match the JSON schema:\n${ajv.errorsText(validate.errors, { separator: '\n', dataVar: 'body' })}`,
    };
  },
};
