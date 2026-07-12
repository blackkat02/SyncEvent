import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from 'vitest';
import { noFullEntityArgs } from '../src/rules/no-full-entity-args';

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: {
    parserOptions: {
      // type-aware rule requires a project reference
      projectService: {
        allowDefaultProject: ['*.ts'],
        defaultProject: 'tsconfig.json',
      },
    },
  },
});

ruleTester.run('no-full-entity-args', noFullEntityArgs, {
  valid: [
    // DTO type — allowed
    {
      code: `
        type CreateUserDto = { name: string; email: string };
        function create(dto: CreateUserDto) {}
        const dto: CreateUserDto = { name: 'Alice', email: 'a@b.com' };
        create(dto);
      `,
    },
    // Partial — allowed
    {
      code: `
        type User = { id: number; name: string; email: string };
        function notify(user: Pick<User, 'email'>) {}
        const payload: Pick<User, 'email'> = { email: 'a@b.com' };
        notify(payload);
      `,
    },
    // Unrelated type — allowed
    {
      code: `
        type Config = { timeout: number };
        function init(cfg: Config) {}
        const cfg: Config = { timeout: 30 };
        init(cfg);
      `,
    },
  ],

  invalid: [
    // Full User type — forbidden
    {
      code: `
        type User = { id: number; name: string; email: string };
        function sendEmail(user: User) {}
        const user: User = { id: 1, name: 'Alice', email: 'a@b.com' };
        sendEmail(user);
      `,
      errors: [{ messageId: 'tooWide', data: { type: 'User' } }],
    },
    // Full Event type — forbidden
    {
      code: `
        type Event = { id: number; title: string; date: string };
        function publish(event: Event) {}
        const event: Event = { id: 1, title: 'Launch', date: '2026-01-01' };
        publish(event);
      `,
      errors: [{ messageId: 'tooWide', data: { type: 'Event' } }],
    },
    // Full Sync type — forbidden
    {
      code: `
        type Sync = { id: number; status: string };
        function trigger(sync: Sync) {}
        const sync: Sync = { id: 1, status: 'pending' };
        trigger(sync);
      `,
      errors: [{ messageId: 'tooWide', data: { type: 'Sync' } }],
    },
    // Full UserModel type — forbidden
    {
      code: `
        type UserModel = { id: number; name: string };
        function process(u: UserModel) {}
        const u: UserModel = { id: 1, name: 'Bob' };
        process(u);
      `,
      errors: [{ messageId: 'tooWide', data: { type: 'UserModel' } }],
    },
  ],
});