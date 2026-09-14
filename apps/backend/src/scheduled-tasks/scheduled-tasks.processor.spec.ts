import { ScheduledTasksProcessor } from './scheduled-tasks.processor';

jest.mock('@nestjs/bullmq', () => ({
  Processor: () => () => {},
  WorkerHost: class {},
}));

describe('ScheduledTasksProcessor', () => {
  let cleanupRefreshTokens: { run: jest.Mock };
  let prisma: { scheduledTaskRun: { create: jest.Mock } };
  let processor: ScheduledTasksProcessor;

  beforeEach(() => {
    cleanupRefreshTokens = { run: jest.fn().mockResolvedValue(3) };
    prisma = { scheduledTaskRun: { create: jest.fn().mockResolvedValue(undefined) } };
    processor = new ScheduledTasksProcessor(cleanupRefreshTokens as never, prisma as never);
  });

  it('routes a cleanup-refresh-tokens job to CleanupRefreshTokensTask.run and records a successful run with its result', async () => {
    await processor.process({ name: 'cleanup-refresh-tokens' } as never);

    expect(cleanupRefreshTokens.run).toHaveBeenCalledTimes(1);
    const data = prisma.scheduledTaskRun.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      taskName: 'cleanup-refresh-tokens',
      success: true,
      result: { deletedCount: 3 },
    });
    expect(data.error).toBeUndefined();
  });

  it('rejects a job whose name has no registered case, and records a failed run instead of throwing away the reason', async () => {
    await expect(
      processor.process({ name: 'not-a-real-task' } as never),
    ).rejects.toThrow('Unknown scheduled task job: not-a-real-task');

    expect(cleanupRefreshTokens.run).not.toHaveBeenCalled();
    const data = prisma.scheduledTaskRun.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      taskName: 'not-a-real-task',
      success: false,
      error: 'Unknown scheduled task job: not-a-real-task',
    });
    expect(data.result).toBeUndefined();
  });

  it('still lets the job outcome propagate even if writing the audit row itself fails', async () => {
    prisma.scheduledTaskRun.create.mockRejectedValue(new Error('db down'));

    await expect(
      processor.process({ name: 'cleanup-refresh-tokens' } as never),
    ).resolves.toBeUndefined();

    expect(cleanupRefreshTokens.run).toHaveBeenCalledTimes(1);
  });
});
