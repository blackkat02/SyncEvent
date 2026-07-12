import { ESLintUtils } from '@typescript-eslint/utils';

const REPO_URL = 'https://github.com/<org>/syncevent';

export const createRule = ESLintUtils.RuleCreator(
  (name) => `${REPO_URL}/blob/main/packages/eslint-rules/docs/${name}.md`,
);
