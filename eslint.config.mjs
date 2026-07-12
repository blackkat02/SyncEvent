import tseslint from "typescript-eslint";
import { baseConfig } from "@syncevent/eslint-rules";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "**/.react-router/**"],
  },
  {
    files: ["apps/backend/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./apps/backend/tsconfig.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  ...baseConfig,
);
