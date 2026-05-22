-- CreateTable
CREATE TABLE "sessions" (
    "session_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL DEFAULT '',
    "tags" TEXT NOT NULL DEFAULT '[]',
    "attributes" TEXT NOT NULL DEFAULT '{}',
    "sdk_version" TEXT NOT NULL DEFAULT '',
    "first_seen_at" BIGINT NOT NULL,
    "last_seen_at" BIGINT NOT NULL,
    "message_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "word_count" INTEGER NOT NULL,
    "char_count" INTEGER NOT NULL,
    "msg_timestamp" BIGINT NOT NULL,
    "ingested_at" BIGINT NOT NULL,
    "metadata" TEXT NOT NULL DEFAULT '{}',

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_log" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "sdk_version" TEXT NOT NULL,
    "message_count" INTEGER NOT NULL,
    "flushed_at" BIGINT NOT NULL,
    "received_at" BIGINT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "ingestion_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_messages_session" ON "messages"("session_id");

-- CreateIndex
CREATE INDEX "idx_messages_role" ON "messages"("role");

-- CreateIndex
CREATE INDEX "idx_messages_ts" ON "messages"("msg_timestamp");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_log" ADD CONSTRAINT "ingestion_log_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE CASCADE ON UPDATE CASCADE;
