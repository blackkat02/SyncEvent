import { ApiProperty } from '@nestjs/swagger';
import { EventVisibility } from '@syncevent/shared';

export class CreateEventDto {
  @ApiProperty()
  title!: string;

  @ApiProperty({ required: false, nullable: true })
  description?: string | null;

  @ApiProperty({ description: 'ISO string date' })
  date!: string;

  @ApiProperty()
  location!: string;

  @ApiProperty({ required: false, nullable: true })
  capacity?: number | null; // Опціональне поле через "?"

  @ApiProperty({
    enum: EventVisibility,
    enumName: 'EventVisibility',
    default: EventVisibility.PUBLIC,
  })
  visibility!: EventVisibility;
}