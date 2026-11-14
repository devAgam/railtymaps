import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

export default defineConfig({
  // Gives tests an in-memory fake of the extension APIs (storage, runtime, ...).
  plugins: [WxtVitest()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
