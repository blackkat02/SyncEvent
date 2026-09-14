import { Module, OnModuleInit } from '@nestjs/common';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { env } from '../../env';
import {
  CLEANUP_REFRESH_TOKENS_CRON,
  CLEANUP_REFRESH_TOKENS_JOB,
  SCHEDULED_TASKS_QUEUE,
} from './scheduled-tasks.constants';
import { ScheduledTasksProcessor } from './scheduled-tasks.processor';
import { CleanupRefreshTokensTask } from './tasks/cleanup-refresh-tokens.task';

@Module({
  imports: [BullModule.registerQueue({ name: SCHEDULED_TASKS_QUEUE })],
  providers: [ScheduledTasksProcessor, CleanupRefreshTokensTask],
})
export class ScheduledTasksModule implements OnModuleInit {
  constructor(@InjectQueue(SCHEDULED_TASKS_QUEUE) private readonly queue: Queue) {}

  async onModuleInit(): Promise<void> {
    await this.queue.upsertJobScheduler(
      CLEANUP_REFRESH_TOKENS_JOB,
      { pattern: CLEANUP_REFRESH_TOKENS_CRON },
      { name: CLEANUP_REFRESH_TOKENS_JOB },
    );

    if (env.NODE_ENV !== 'production') {
      await this.queue.add(CLEANUP_REFRESH_TOKENS_JOB, {});
    }
  }
}
