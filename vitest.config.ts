/**
 * Vitest setup. Unit tests target src/lib/** only — pure TypeScript with no
 * Astro runtime (layer rule: lib code must be testable without the framework).
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
  },
});
