/**
 * Kafka topic names for domain events (facts that already happened).
 *
 * A plain `as const` object rather than a TS `enum` so it survives
 * `erasableSyntaxOnly` type-stripping and can be tree-shaken; the companion
 * `EventTopics` type gives the union of the string values.
 */
export const EventTopics = {
  USER_JOINED: 'event.user-joined',
  USER_LEFT: 'event.user-left',
  EVENT_CREATED: 'event.created',
  EVENT_DELETED: 'event.deleted',
} as const;

export type EventTopics = (typeof EventTopics)[keyof typeof EventTopics];

/**
 * Fields every domain-event payload carries.
 *
 * `messageId` is the outbox row id — stable across Kafka redeliveries, so a
 * consumer can dedupe on it. `occurredAt` is when the fact was recorded.
 */
export interface DomainEventMeta {
  messageId: string;
  occurredAt: string;
}

export interface UserJoinedPayload extends DomainEventMeta {
  eventId: string;
  userId: string;
  joinedAt: string;
}

export interface UserLeftPayload extends DomainEventMeta {
  eventId: string;
  userId: string;
  leftAt: string;
}

export interface EventCreatedPayload extends DomainEventMeta {
  eventId: string;
  authorId: string;
  title: string;
  createdAt: string;
}

export interface EventDeletedPayload extends DomainEventMeta {
  eventId: string;
  deletedBy: string;
  deletedAt: string;
}

/** Discriminated map from topic → payload type. */
export interface EventPayloadByTopic {
  [EventTopics.USER_JOINED]: UserJoinedPayload;
  [EventTopics.USER_LEFT]: UserLeftPayload;
  [EventTopics.EVENT_CREATED]: EventCreatedPayload;
  [EventTopics.EVENT_DELETED]: EventDeletedPayload;
}
