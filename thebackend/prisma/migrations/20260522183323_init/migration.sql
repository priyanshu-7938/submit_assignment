-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('COMPLETED', 'ERRORED', 'CANCELLED', 'STREAMING');

-- CreateTable
CREATE TABLE "communications" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "provider" TEXT,
    "model" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "totalMessages" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "communications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "communicationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "content" TEXT NOT NULL,
    "preview" TEXT,
    "sequenceNumber" INTEGER NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inference_logs" (
    "id" TEXT NOT NULL,
    "communicationId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "latencyMs" INTEGER,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "inputPreview" TEXT,
    "outputPreview" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inference_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observability_events" (
    "id" TEXT NOT NULL,
    "inferenceLogId" TEXT,
    "type" TEXT NOT NULL,
    "tokens" INTEGER,
    "throughputTps" DOUBLE PRECISION,
    "latencyMs" INTEGER,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observability_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_snapshots" (
    "id" TEXT NOT NULL,
    "provider" TEXT,
    "model" TEXT,
    "totalRequests" INTEGER NOT NULL DEFAULT 0,
    "successfulRequests" INTEGER NOT NULL DEFAULT 0,
    "failedRequests" INTEGER NOT NULL DEFAULT 0,
    "cancelledRequests" INTEGER NOT NULL DEFAULT 0,
    "avgLatencyMs" DOUBLE PRECISION,
    "totalTokens" BIGINT,
    "throughputPerMinute" DOUBLE PRECISION,
    "snapshotStart" TIMESTAMP(3) NOT NULL,
    "snapshotEnd" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "communications_startedAt_idx" ON "communications"("startedAt");

-- CreateIndex
CREATE INDEX "messages_communicationId_idx" ON "messages"("communicationId");

-- CreateIndex
CREATE INDEX "messages_createdAt_idx" ON "messages"("createdAt");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- CreateIndex
CREATE INDEX "inference_logs_provider_idx" ON "inference_logs"("provider");

-- CreateIndex
CREATE INDEX "inference_logs_model_idx" ON "inference_logs"("model");

-- CreateIndex
CREATE INDEX "inference_logs_status_idx" ON "inference_logs"("status");

-- CreateIndex
CREATE INDEX "inference_logs_startedAt_idx" ON "inference_logs"("startedAt");

-- CreateIndex
CREATE INDEX "observability_events_type_idx" ON "observability_events"("type");

-- CreateIndex
CREATE INDEX "observability_events_createdAt_idx" ON "observability_events"("createdAt");

-- CreateIndex
CREATE INDEX "analytics_snapshots_snapshotStart_snapshotEnd_idx" ON "analytics_snapshots"("snapshotStart", "snapshotEnd");

-- CreateIndex
CREATE INDEX "analytics_snapshots_provider_idx" ON "analytics_snapshots"("provider");

-- CreateIndex
CREATE INDEX "analytics_snapshots_model_idx" ON "analytics_snapshots"("model");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "communications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inference_logs" ADD CONSTRAINT "inference_logs_communicationId_fkey" FOREIGN KEY ("communicationId") REFERENCES "communications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observability_events" ADD CONSTRAINT "observability_events_inferenceLogId_fkey" FOREIGN KEY ("inferenceLogId") REFERENCES "inference_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
