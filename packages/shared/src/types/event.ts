import { EventVisibility } from '../schemas/event.schema.js';

export interface Participant {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
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
  participants: Participant[];
  participantsCount: number;
  isJoined: boolean;
  isAuthor: boolean;
}