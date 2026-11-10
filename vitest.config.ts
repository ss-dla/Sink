import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

interface HandledValidationError {
  statusCode: 400
  statusMessage: 'Validation Error'
  data: {
    issues: unknown[]
    name: 'ZodError'
    stack: string
  }
}

function isHandledValidationError(error: unknown): error is HandledValidationError {
  if (typeof error !== 'object' || error === null
    || !('statusCode' in error) || error.statusCode !== 400
    || !('statusMessage' in error) || error.statusMessage !== 'Validation Error'
    || !('data' in error) || typeof error.data !== 'object' || error.data === null) {
    return false
  }

  const { data } = error
  return 'issues' in data && Array.isArray(data.issues)
    && 'name' in data && data.name === 'ZodError'
    && 'stack' in data && typeof data.stack === 'string'
    && data.stack.includes('validateData')
}

export default defineConfig(async ({ mode }) => ({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        cf: true,
        r2Buckets: ['R2'],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations('./drizzle'),
          NUXT_GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
          NUXT_GOOGLE_CLIENT_SECRET: 'test-client-secret',
          NUXT_SESSION_SECRET: 'test-session-secret-for-vitest',
          NUXT_BOOTSTRAP_ADMINS: 'boot@datalabs.id',
        },
      },
    }),
  ],
  test: {
    env: loadEnv(mode, process.cwd(), ''),
    isolate: false,
    maxWorkers: 1,
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10_000,
    onUnhandledError(error) {
      return !isHandledValidationError(error)
    },
  },
}))
