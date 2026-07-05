-- Broaden notification preferences so users can steer every channel and category.
--   sms_enabled       : SMS channel toggle (opt-in, like push)
--   deal_alerts       : real-estate deal events (new interest, lead updates, status/doc changes)
--   deal_board_weekly : weekly roundup of the user's watched / interested deals
-- One column per statement — H2 (dev/test) does not support comma-separated ADD COLUMN,
-- and separate statements are equally valid on Postgres (prod).
ALTER TABLE notification_preferences ADD COLUMN sms_enabled       BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE notification_preferences ADD COLUMN deal_alerts       BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE notification_preferences ADD COLUMN deal_board_weekly BOOLEAN NOT NULL DEFAULT TRUE;
