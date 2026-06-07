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
 * Mock PUSH provider. Logs the message and returns success with a synthetic providerRef.
 *
 * To swap in a real provider, add e.g. FcmPushProvider implementing ChannelProvider
 * (channel()=PUSH, name()="fcm") and set: comms.provider.push=fcm
 */
@Component
public class MockPushProvider implements ChannelProvider {

    private static final Logger log = LoggerFactory.getLogger(MockPushProvider.class);

    @Override
    public Channel channel() {
        return Channel.PUSH;
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta) {
        String ref = "mock-push-" + UUID.randomUUID();
        log.info("[MockPushProvider] PUSH to={} title='{}' body='{}' ref={}", recipient, subject, body, ref);
        return DeliveryResult.sent(Channel.PUSH, ref, "Mock push delivered");
    }
}
