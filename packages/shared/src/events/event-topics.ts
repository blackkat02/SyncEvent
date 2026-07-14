export enum EventTopics {
  USER_JOINED = 'event.user-joined',
  USER_LEFT = 'event.user-left',
  EVENT_CREATED = 'event.created',
  EVENT_DELETED = 'event.deleted',
}

export interface UserJoinedPayload {
  eventId: string;
  userId: string;
  joinedAt: string;
}

export interface UserLeftPayload {
  eventId: string;
  userId: string;
  leftAt: string;
}

export interface EventCreatedPayload {
  eventId: string;
  authorId: string;
  title: string;
  createdAt: string;
}

export interface EventDeletedPayload {
  eventId: string;
  deletedBy: string;
  deletedAt: string;
}
