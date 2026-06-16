-- Hot-path indexes. The notifications list is fetched per user, newest-first, and the
-- unread badge counts unread rows per user. notification_preferences.user_id is UNIQUE
-- (already indexed), so it needs nothing here.

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread  ON notifications (user_id, is_read);
