import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // The calendar tests compute whole romcal years and the pipeline tests
    // render real JPEGs, so the default 5s timeout is too tight.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
