import type { FlatConfig } from '@typescript-eslint/utils/ts-eslint';
import { rules } from '../rules/index.js';

const config: FlatConfig.Config = {
  plugins: {
    local: { rules },
  },
  rules: {
    'local/no-prisma-in-controller': 'error',
    'local/no-full-entity-args': 'warn',
  },
};

export const baseConfig = [config];
