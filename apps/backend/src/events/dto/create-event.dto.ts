import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';
import { EventVisibility } from '@syncevent/shared';

export const createEventDtoSchema = z.object({
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  date: z.iso.datetime().describe('ISO string date'),
  location: z.string().min(1),
  capacity: z.number().int().min(1).nullable().optional(),
  visibility: z.nativeEnum(EventVisibility),
});

export class CreateEventDto extends createZodDto(createEventDtoSchema) { }
