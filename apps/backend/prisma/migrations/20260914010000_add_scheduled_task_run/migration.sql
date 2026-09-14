-- Run history for ScheduledTasksModule (docs/architecture/scheduled-tasks-worker.md
-- §6 Фаза 2): one row per job execution, written by ScheduledTasksProcessor for
-- every task in the queue -- generic, so task 2, 3... get this for free.

-- CreateTable
CREATE TABLE "ScheduledTaskRun" (
    "id"         TEXT NOT NULL,
    "taskName"   TEXT NOT NULL,
    "startedAt"  TIMESTAMP(3) NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "success"    BOOLEAN NOT NULL,
    "result"     JSONB,
    "error"      TEXT,

    CONSTRAINT "ScheduledTaskRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScheduledTaskRun_taskName_startedAt_idx" ON "ScheduledTaskRun"("taskName", "startedAt");
