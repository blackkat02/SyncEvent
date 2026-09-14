import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CLEANUP_REFRESH_TOKENS_JOB, SCHEDULED_TASKS_QUEUE } from './scheduled-tasks.constants';
import { CleanupRefreshTokensTask } from './tasks/cleanup-refresh-tokens.task';

@Processor(SCHEDULED_TASKS_QUEUE)
export class ScheduledTasksProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduledTasksProcessor.name);

  constructor(
    private readonly cleanupRefreshTokens: CleanupRefreshTokensTask,
    private readonly prisma: PrismaService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const startedAt = new Date();
    const started = Date.now();

    try {
      const result = await this.dispatch(job);
      await this.recordRun(job.name, startedAt, Date.now() - started, true, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.recordRun(job.name, startedAt, Date.now() - started, false, undefined, message);
      throw err;
    }
  }

  private async dispatch(job: Job): Promise<Prisma.InputJsonValue | undefined> {
    switch (job.name) {
      case CLEANUP_REFRESH_TOKENS_JOB: {
        const deletedCount = await this.cleanupRefreshTokens.run();
        return { deletedCount };
      }
      default:
        throw new Error(`Unknown scheduled task job: ${job.name}`);
    }
  }

  private async recordRun(
    taskName: string,
    startedAt: Date,
    durationMs: number,
    success: boolean,
    result?: Prisma.InputJsonValue,
    error?: string,
  ): Promise<void> {
    this.logger.log(`${taskName} ${success ? 'finished' : 'failed'} in ${durationMs}ms`);
    try {
      const data: Prisma.ScheduledTaskRunCreateInput = {
        taskName,
        startedAt,
        durationMs,
        success,
        ...(result !== undefined ? { result } : {}),
        ...(error !== undefined ? { error } : {}),
      };
      await this.prisma.scheduledTaskRun.create({ data });
    } catch (recordErr) {
      this.logger.error(
        `failed to record run for ${taskName}: ${
          recordErr instanceof Error ? recordErr.message : String(recordErr)
        }`,
      );
    }
  }
}
