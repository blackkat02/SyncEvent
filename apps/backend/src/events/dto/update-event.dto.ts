import { CreateEventDto } from './create-event.dto';

export class UpdateEventDto implements Partial<CreateEventDto> {
  [key: string]: unknown;

  title?: string;
  description?: string;
  date?: string;
  location?: string;
}
