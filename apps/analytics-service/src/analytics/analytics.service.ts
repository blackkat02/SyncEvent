import { Injectable, Logger } from '@nestjs/common';
import {
  UserJoinedPayload,
  UserLeftPayload,
  EventCreatedPayload,
  EventDeletedPayload,
} from '@syncevent/shared';
import { SeenMessages } from '../common/seen-messages';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);
  private readonly seen = new SeenMessages();

  /** Returns true if the message is a duplicate that should be skipped. */
  private isDuplicate(messageId: string): boolean {
    if (this.seen.add(messageId)) return false;
    this.logger.debug(`skip duplicate message ${messageId}`);
    return true;
  }

  async trackJoin(data: UserJoinedPayload) {
    if (this.isDuplicate(data.messageId)) return;
    // TODO: писати метрику в ClickHouse / окрему таблицю
    this.logger.log(`[analytics] join: ${JSON.stringify(data)}`);
  }

  async trackLeave(data: UserLeftPayload) {
    if (this.isDuplicate(data.messageId)) return;
    this.logger.log(`[analytics] leave: ${JSON.stringify(data)}`);
  }

  async trackEventCreated(data: EventCreatedPayload) {
    if (this.isDuplicate(data.messageId)) return;
    this.logger.log(`[analytics] event created: ${JSON.stringify(data)}`);
  }

  async trackEventDeleted(data: EventDeletedPayload) {
    if (this.isDuplicate(data.messageId)) return;
    this.logger.log(`[analytics] event deleted: ${JSON.stringify(data)}`);
  }
}
