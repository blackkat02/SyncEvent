import { noPrismaInController } from './no-prisma-in-controller.js';
import { noFullEntityArgs } from './no-full-entity-args.js';

export const rules = {
  'no-prisma-in-controller': noPrismaInController,
  'no-full-entity-args': noFullEntityArgs,
};
