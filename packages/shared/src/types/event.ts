import { EventVisibility } from '../schemas/event.schema.js';

export interface EventResponse {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string;
  capacity: number | null;
  visibility: EventVisibility;
  authorId: string;
  author: { id: string; email: string };
  _count: { participants: number };
  isJoined: boolean;
}