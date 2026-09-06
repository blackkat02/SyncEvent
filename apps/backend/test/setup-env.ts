/**
 * Global setup for unit tests.
 *
 * Several modules (e.g. `env.ts`) read required environment variables at import
 * time and throw when they are missing. Unit tests must never touch a real
 * database or real secrets, so we provide deterministic dummy values here before
 * any application module is loaded.
 */
const defaults: Record<string, string> = {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  JWT_SECRET: 'test-jwt-secret',
  JWT_REFRESH_SECRET: 'test-jwt-refresh-secret',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
  NODE_ENV: 'test',
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
