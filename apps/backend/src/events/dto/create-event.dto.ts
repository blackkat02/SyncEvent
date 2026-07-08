import { ApiProperty } from '@nestjs/swagger';
import { EventVisibility } from '@syncevent/shared';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsInt,
  Min,
  IsEnum,
} from 'class-validator';

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  description?: string | null;

  @ApiProperty({ description: 'ISO string date' })
  @IsDateString()
  date!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  location!: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number | null;

  @ApiProperty({
    enum: EventVisibility,
    enumName: 'EventVisibility',
    default: EventVisibility.PUBLIC,
  })
  @IsEnum(EventVisibility)
  visibility!: EventVisibility;
}