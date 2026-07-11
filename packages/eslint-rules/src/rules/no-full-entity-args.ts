import { ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule.js';

export const noFullEntityArgs = createRule({
  name: 'no-full-entity-args',
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallows passing full Prisma entity types as arguments where a DTO is sufficient',
    },
    messages: {
      tooWide: 'Argument has full entity type "{{type}}" — narrow it to the required fields or a DTO.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const services = ESLintUtils.getParserServices(context);
    const checker = services.program.getTypeChecker();

    return {
      CallExpression(node) {
        for (const arg of node.arguments) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(arg);
          const type = checker.getTypeAtLocation(tsNode);
          const typeName = checker.typeToString(type);
          if (/^(User|Event|Sync)(Model)?$/.test(typeName)) {
            context.report({ node: arg, messageId: 'tooWide', data: { type: typeName } });
          }
        }
      },
    };
  },
});
