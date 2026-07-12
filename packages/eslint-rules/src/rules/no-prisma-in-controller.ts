import { createRule } from '../utils/createRule.js';

export const noPrismaInController = createRule({
  name: 'no-prisma-in-controller',
  meta: {
    type: 'problem',
    docs: {
      description: [
        'Disallows importing PrismaService or PrismaClient directly in controller files.',
        '',
        'Controllers must interact with the database exclusively through the service layer.',
        'This enforces separation of concerns and keeps controllers thin.',
        '',
        'Valid:',
        '  import { UserService } from "./user.service";',
        '',
        'Invalid:',
        '  import { PrismaService } from "../prisma/prisma.service";',
        '  import { PrismaClient } from "@prisma/client";',
      ].join('\n'),
    },
    messages: {
      forbidden: [
        'Controllers must not import Prisma directly.',
        'Inject the appropriate Service instead.',
        '',
        'Invalid:',
        '  import { PrismaService } from "../prisma/prisma.service";',
        '',
        'Valid:',
        '  import { UserService } from "./user.service";',
      ].join('\n'),
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
