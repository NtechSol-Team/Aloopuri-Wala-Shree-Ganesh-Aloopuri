-- A short grace window on refresh-token rotation, so a session shared across two
-- browser tabs doesn't get revoked when the second tab's now-superseded token
-- arrives moments after the first tab already rotated it.

-- AlterTable
ALTER TABLE "user_sessions" ADD COLUMN     "previous_hash_expires_at" TIMESTAMPTZ(6),
ADD COLUMN     "previous_refresh_token_hash" TEXT;
