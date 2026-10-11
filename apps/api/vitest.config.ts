import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: 'api',
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The first test of a file builds the whole server; under a full parallel run on a small
    // machine that can take longer than the 5 s default.
    testTimeout: 30_000,
  },
});
