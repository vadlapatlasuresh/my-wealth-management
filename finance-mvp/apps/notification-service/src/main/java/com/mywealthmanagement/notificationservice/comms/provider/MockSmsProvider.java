package com.mywealthmanagement.notificationservice.comms.provider;

import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelProvider;
import com.mywealthmanagement.notificationservice.comms.DeliveryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/**
 * Mock SMS provider. Logs the message and returns success with a synthetic providerRef.
 *
 * To use a real SMS provider instead, add a sibling class, e.g.:
 *
 *   {@code @Component}
 *   public class TwilioSmsProvider implements ChannelProvider {
 *       public Channel channel() { return Channel.SMS; }
 *       public String name()    { return "twilio"; }
 *       public DeliveryResult send(...) { ... call Twilio API ... }
 *   }
 *
 * Then switch the active provider with NO other code change:
 *   comms.provider.sms=twilio
 */
@Component
public class MockSmsProvider implements ChannelProvider {

    private static final Logger log = LoggerFactory.getLogger(MockSmsProvider.class);

    @Override
    public Channel channel() {
        return Channel.SMS;
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta) {
        String ref = "mock-sms-" + UUID.randomUUID();
        log.info("[MockSmsProvider] SMS to={} body='{}' ref={}", recipient, body, ref);
        return DeliveryResult.sent(Channel.SMS, ref, "Mock SMS delivered");
    }
}
