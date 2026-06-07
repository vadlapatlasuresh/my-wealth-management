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
 * Mock EMAIL provider. Logs the message and returns success with a synthetic providerRef.
 *
 * To swap in a real provider, add e.g. SendGridEmailProvider implementing ChannelProvider
 * (channel()=EMAIL, name()="sendgrid") and set: comms.provider.email=sendgrid
 */
@Component
public class MockEmailProvider implements ChannelProvider {

    private static final Logger log = LoggerFactory.getLogger(MockEmailProvider.class);

    @Override
    public Channel channel() {
        return Channel.EMAIL;
    }

    @Override
    public String name() {
        return "mock";
    }

    @Override
    public DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta) {
        String ref = "mock-email-" + UUID.randomUUID();
        log.info("[MockEmailProvider] EMAIL to={} subject='{}' body='{}' ref={}", recipient, subject, body, ref);
        return DeliveryResult.sent(Channel.EMAIL, ref, "Mock email delivered");
    }
}
