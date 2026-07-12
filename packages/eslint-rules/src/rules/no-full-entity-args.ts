import { ESLintUtils } from '@typescript-eslint/utils';
import { createRule } from '../utils/createRule.js';

export const noFullEntityArgs = createRule({
  name: 'no-full-entity-args',
  meta: {
    type: 'suggestion',
    docs: {
      description: [
        'Disallows passing full Prisma entity types as function arguments where a DTO is sufficient.',
        '',
        'Passing entire database entities across architectural boundaries (e.g. from service to',
        'another service or handler) leaks persistence details and breaks encapsulation.',
        'Use a narrowed type or a dedicated DTO instead.',
        '',
        'Valid:',
        '  type CreateUserDto = { name: string; email: string };',
        '  function sendEmail(dto: CreateUserDto) {}',
        '',
        'Invalid:',
        '  type User = { id: number; name: string; email: string; passwordHash: string };',
        '  function sendEmail(user: User) {}',
      ].join('\n'),
    },
    messages: {
      tooWide: [
        'Argument has full entity type "{{type}}" — narrow it to a DTO or Pick<> instead.',
        '',
        'Invalid:',
        '  function sendEmail(user: User) {}',
        '',
        'Valid:',
        '  function sendEmail(dto: Pick<User, "name" | "email">) {}',
      ].join('\n'),
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
          if (/^(User|Sync)(Model)?$/.test(typeName)) {
            context.report({ node: arg, messageId: 'tooWide', data: { type: typeName } });
          }
        }
      },
    };
  },
});
