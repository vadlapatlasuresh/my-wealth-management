-- Broaden notification preferences so users can steer every channel and category.
--   sms_enabled       : SMS channel toggle (opt-in, like push)
--   deal_alerts       : real-estate deal events (new interest, lead updates, status/doc changes)
--   deal_board_weekly : weekly roundup of the user's watched / interested deals
ALTER TABLE notification_preferences
    ADD COLUMN sms_enabled       BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN deal_alerts       BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN deal_board_weekly BOOLEAN NOT NULL DEFAULT TRUE;
