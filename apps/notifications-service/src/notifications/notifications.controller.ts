import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  EventTopics,
  UserJoinedPayload,
  UserLeftPayload,
} from '@syncevent/shared';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @EventPattern(EventTopics.USER_JOINED)
  async handleUserJoined(@Payload() data: UserJoinedPayload) {
    await this.notifications.notifyOrganizerAboutJoin(data);
  }

  @EventPattern(EventTopics.USER_LEFT)
  async handleUserLeft(@Payload() data: UserLeftPayload) {
    await this.notifications.notifyOrganizerAboutLeave(data);
  }
}
