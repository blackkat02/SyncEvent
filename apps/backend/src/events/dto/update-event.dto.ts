import { PartialType } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';
import { Visibility } from '@prisma/client';

export class UpdateEventDto extends PartialType(CreateEventDto) {
  title?: string;
  description?: string;
  date?: string | Date;
  location?: string;
  capacity?: number;
  visibility?: Visibility;
}
