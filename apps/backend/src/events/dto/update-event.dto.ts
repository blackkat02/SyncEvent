import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateEventDto } from './create-event.dto';
import { UpdateEventInput, EventVisibility } from '@syncevent/shared';

export class UpdateEventDto
  extends PartialType(CreateEventDto)
  // eslint-disable-next-line prettier/prettier
  implements UpdateEventInput {
  @ApiPropertyOptional({ example: 'My Updated Event' })
  title?: string;

  @ApiPropertyOptional({ example: 'Updated description of the event' })
  description?: string;

  @ApiPropertyOptional({ example: '2026-10-10T15:00:00Z', type: Date })
  date?: Date;

  @ApiPropertyOptional({ example: 50 })
  capacity?: number;

  @ApiPropertyOptional({
    enum: EventVisibility,
    example: EventVisibility.PUBLIC,
  })
  visibility?: EventVisibility;
}
