"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
function requireEnv(key) {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Missing required environment variable: ${key}`);
    }
    return value;
}
function requireEnvWithDefault(key, defaultValue) {
    return process.env[key] ?? defaultValue;
}
exports.env = {
    DATABASE_URL: requireEnv('DATABASE_URL'),
    JWT_SECRET: requireEnv('JWT_SECRET'),
    JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
    JWT_ACCESS_EXPIRES_IN: requireEnvWithDefault('JWT_ACCESS_EXPIRES_IN', '15m'),
    JWT_REFRESH_EXPIRES_IN: requireEnvWithDefault('JWT_REFRESH_EXPIRES_IN', '7d'),
    PORT: Number(process.env.PORT ?? 3000),
    NODE_ENV: requireEnvWithDefault('NODE_ENV', 'development'),
};
