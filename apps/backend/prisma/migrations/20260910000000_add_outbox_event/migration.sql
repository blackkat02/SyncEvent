-- Transactional outbox for domain events (docs/architecture/booking-concurrency.md §6.4).
CREATE TABLE "OutboxEvent" (
    "id"        TEXT NOT NULL,
    "topic"     TEXT NOT NULL,
    "key"       TEXT NOT NULL,
    "payload"   JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt"    TIMESTAMP(3),

    CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);

-- Relay scan: unsent rows, oldest first.
CREATE INDEX "OutboxEvent_sentAt_createdAt_idx" ON "OutboxEvent"("sentAt", "createdAt");
