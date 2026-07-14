import { Injectable, Logger } from '@nestjs/common';
import { UserJoinedPayload } from '@syncevent/shared';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async notifyOrganizerAboutJoin(data: UserJoinedPayload) {
    // TODO: реальна відправка (email / websocket / push)
    this.logger.log(
      `User ${data.userId} joined event ${data.eventId} at ${data.joinedAt}`,
    );
  }
}
