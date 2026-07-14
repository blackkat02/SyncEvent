import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications/notifications.controller';
import { NotificationsService } from './notifications/notifications.service';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class AppModule {}
