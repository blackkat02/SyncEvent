import { createRule } from '../utils/createRule.js';

export const noPrismaInController = createRule({
  name: 'no-prisma-in-controller',
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallows importing PrismaService/PrismaClient in *.controller.ts',
    },
    messages: {
      forbidden: 'Controller must not depend on Prisma directly — inject the appropriate Service.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const filename = context.filename;
    if (!filename.endsWith('.controller.ts')) return {};

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (
          source.includes('@prisma/client') ||
          source.endsWith('prisma.service')
        ) {
          context.report({ node, messageId: 'forbidden' });
        }
      },
    };
  },
});
