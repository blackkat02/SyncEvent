import { ApiProperty } from '@nestjs/swagger';
import { Visibility } from '@prisma/client';
import { CreateEventInput, EventVisibility } from '@syncevent/shared';

export class CreateEventDto implements CreateEventInput {
  @ApiProperty({ example: 'Tech Conference 2026' })
  title: string;

  @ApiProperty({ example: 'Description...', required: false })
  description?: string;

  @ApiProperty({ example: '2026-11-15T09:00:00Z', type: String })
  date: Date;

  @ApiProperty({ example: 'Kyiv, Ukraine' })
  location: string;

  @ApiProperty({ example: 500, required: false })
  capacity?: number;

  @ApiProperty({
    enum: Visibility,
    enumName: 'Visibility',
    default: Visibility.PUBLIC,
  })
  visibility: EventVisibility;
}
