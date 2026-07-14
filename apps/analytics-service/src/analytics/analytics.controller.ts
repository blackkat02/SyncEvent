import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import {
  EventTopics,
  UserJoinedPayload,
  UserLeftPayload,
  EventCreatedPayload,
} from '@syncevent/shared';
import { AnalyticsService } from './analytics.service';

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @EventPattern(EventTopics.USER_JOINED)
  async handleUserJoined(@Payload() data: UserJoinedPayload) {
    await this.analytics.trackJoin(data);
  }

  @EventPattern(EventTopics.USER_LEFT)
  async handleUserLeft(@Payload() data: UserLeftPayload) {
    await this.analytics.trackLeave(data);
  }

  @EventPattern(EventTopics.EVENT_CREATED)
  async handleEventCreated(@Payload() data: EventCreatedPayload) {
    await this.analytics.trackEventCreated(data);
  }
}
