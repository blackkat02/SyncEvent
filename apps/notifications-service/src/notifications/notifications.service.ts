import { Injectable, Logger } from '@nestjs/common';
import { UserJoinedPayload, UserLeftPayload } from '@syncevent/shared';
import { SeenMessages } from '../common/seen-messages';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly seen = new SeenMessages();

  private isDuplicate(messageId: string): boolean {
    if (this.seen.add(messageId)) return false;
    this.logger.debug(`skip duplicate message ${messageId}`);
    return true;
  }

  async notifyOrganizerAboutJoin(data: UserJoinedPayload) {
    if (this.isDuplicate(data.messageId)) return;
    // TODO: реальна відправка (email / websocket / push)
    this.logger.log(
      `User ${data.userId} joined event ${data.eventId} at ${data.joinedAt}`,
    );
  }

  async notifyOrganizerAboutLeave(data: UserLeftPayload) {
    if (this.isDuplicate(data.messageId)) return;
    this.logger.log(
      `User ${data.userId} left event ${data.eventId} at ${data.leftAt}`,
    );
  }
}
