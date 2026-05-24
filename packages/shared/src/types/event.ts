import { EventVisibility } from '../schemas/event.schema.js';

export interface Participant {
  id: string;
  email: string;
  displayName: string | null;
}

export interface EventResponse {
  id: string;
  title: string;
  description: string | null;
  date: string;
  location: string;
  capacity: number | null;
  visibility: EventVisibility;
  authorId: string;
  author: { id: string; email: string; displayName: string | null };
  _count: { participants: number };
  isJoined: boolean;
}

export interface EventDetailResponse extends EventResponse {
  participants: Participant[];
}

export interface CreateEventRequest {
  title: string;
  location: string;
  visibility: EventVisibility;
  description?: string | null;
  date: string;
  capacity?: number | null;
}

export type UpdateEventRequest = Partial<CreateEventRequest>;