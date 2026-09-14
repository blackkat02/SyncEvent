import { createZodDto } from 'nestjs-zod';
import { createEventDtoSchema } from './create-event.dto';

export class UpdateEventDto extends createZodDto(createEventDtoSchema.partial()) { }
