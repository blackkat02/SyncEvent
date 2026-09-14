import { env } from '../../env';
import { ScheduledTasksModule } from './scheduled-tasks.module';
import {
  CLEANUP_REFRESH_TOKENS_CRON,
  CLEANUP_REFRESH_TOKENS_JOB,
} from './scheduled-tasks.constants';

jest.mock('@nestjs/bullmq', () => ({
  BullModule: { registerQueue: () => ({}) },
  InjectQueue: () => () => {},
  Processor: () => () => {},
  WorkerHost: class {},
}));

describe('ScheduledTasksModule', () => {
  let queue: { upsertJobScheduler: jest.Mock; add: jest.Mock };
  let originalNodeEnv: string;

  beforeEach(() => {
    originalNodeEnv = env.NODE_ENV;
    queue = {
      upsertJobScheduler: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
  });

  it('registers the cleanup-refresh-tokens job scheduler on module init, keyed by a stable id', async () => {
    const module = new ScheduledTasksModule(queue as never);

    await module.onModuleInit();

    expect(queue.upsertJobScheduler).toHaveBeenCalledWith(
      CLEANUP_REFRESH_TOKENS_JOB,
      { pattern: CLEANUP_REFRESH_TOKENS_CRON },
      { name: CLEANUP_REFRESH_TOKENS_JOB },
    );
  });

  it('enqueues a one-off eager catch-up job outside production, through the same queue a scheduled tick uses -- so it gets recorded in ScheduledTaskRun like any other run', async () => {
    env.NODE_ENV = 'development';
    const module = new ScheduledTasksModule(queue as never);

    await module.onModuleInit();

    expect(queue.add).toHaveBeenCalledWith(CLEANUP_REFRESH_TOKENS_JOB, {});
  });

  it('skips the eager catch-up pass in production, where the host is not expected to be shut down between ticks', async () => {
    env.NODE_ENV = 'production';
    const module = new ScheduledTasksModule(queue as never);

    await module.onModuleInit();

    expect(queue.add).not.toHaveBeenCalled();
  });
});
