CREATE TABLE message_template (
    id BIGSERIAL PRIMARY KEY,
    template_key VARCHAR(100) NOT NULL,
    channel VARCHAR(20) NOT NULL,        -- SMS|EMAIL|PUSH|IN_APP
    locale VARCHAR(10) NOT NULL,
    subject VARCHAR(255),                -- nullable (e.g. SMS has no subject)
    body VARCHAR(4000) NOT NULL,
    variables VARCHAR(500),              -- comma-separated declared variables, informational
    version INT NOT NULL DEFAULT 1,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uq_message_template UNIQUE (template_key, channel, locale, version)
);

-- Seed templates (locale en)
INSERT INTO message_template (template_key, channel, locale, subject, body, variables, version, enabled) VALUES
    ('bill.paid', 'IN_APP', 'en', 'Payment sent',
     'Your payment of {{amount}} to {{payee}} was sent.',
     'amount,payee', 1, TRUE),
    ('bill.paid', 'EMAIL', 'en', 'Your payment to {{payee}}',
     'Hi {{name}}, your payment of {{amount}} to {{payee}} is on its way.',
     'name,amount,payee', 1, TRUE),
    ('budget.exceeded', 'IN_APP', 'en', 'Budget alert',
     'You''ve used {{pct}}% of your {{category}} budget.',
     'pct,category', 1, TRUE);
