import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';
import { noPrismaInController } from '../src/rules/no-prisma-in-controller';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

ruleTester.run('no-prisma-in-controller', noPrismaInController, {
  valid: [
    {
      filename: 'user.controller.ts',
      code: `import { UserService } from './user.service';`,
    },
  ],
  invalid: [
    {
      filename: 'user.controller.ts',
      code: `import { PrismaService } from '../prisma/prisma.service';`,
      errors: [{ messageId: 'forbidden' }],
    },
  ],
});
