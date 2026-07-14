import { Injectable, Logger } from '@nestjs/common';
import {
  UserJoinedPayload,
  UserLeftPayload,
  EventCreatedPayload,
} from '@syncevent/shared';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  async trackJoin(data: UserJoinedPayload) {
    // TODO: писати метрику в ClickHouse / окрему таблицю
    this.logger.log(`[analytics] join: ${JSON.stringify(data)}`);
  }

  async trackLeave(data: UserLeftPayload) {
    this.logger.log(`[analytics] leave: ${JSON.stringify(data)}`);
  }

  async trackEventCreated(data: EventCreatedPayload) {
    this.logger.log(`[analytics] event created: ${JSON.stringify(data)}`);
  }
}
