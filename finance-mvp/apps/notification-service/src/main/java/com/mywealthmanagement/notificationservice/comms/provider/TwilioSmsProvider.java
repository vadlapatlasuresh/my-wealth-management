package com.mywealthmanagement.notificationservice.comms.provider;

import com.fasterxml.jackson.databind.JsonNode;
import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelProvider;
import com.mywealthmanagement.notificationservice.comms.DeliveryResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Map;

/**
 * Real SMS provider backed by the Twilio Messages API. Selected when
 * {@code comms.provider.sms=twilio}. Requires {@code TWILIO_ACCOUNT_SID},
 * {@code TWILIO_AUTH_TOKEN}, and {@code TWILIO_FROM}; if any is missing it returns a
 * FAILED result rather than pretending to deliver.
 */
@Component
public class TwilioSmsProvider implements ChannelProvider {

    private static final Logger log = LoggerFactory.getLogger(TwilioSmsProvider.class);

    private final RestClient restClient;
    private final String accountSid;
    private final String authToken;
    private final String fromNumber;

    public TwilioSmsProvider(
            @Value("${twilio.base-url:https://api.twilio.com}") String baseUrl,
            @Value("${twilio.account-sid:}") String accountSid,
            @Value("${twilio.auth-token:}") String authToken,
            @Value("${twilio.from:}") String fromNumber) {
        this.restClient = RestClient.builder().baseUrl(baseUrl)
                .requestFactory(com.mywealthmanagement.notificationservice.comms.HttpTimeouts.provider()).build();
        this.accountSid = accountSid;
        this.authToken = authToken;
        this.fromNumber = fromNumber;
    }

    @Override
    public Channel channel() {
        return Channel.SMS;
    }

    @Override
    public String name() {
        return "twilio";
    }

    @Override
    public DeliveryResult send(String recipient, String subject, String body, Map<String, Object> meta) {
        if (accountSid.isBlank() || authToken.isBlank() || fromNumber.isBlank()) {
            return DeliveryResult.failed(Channel.SMS,
                    "Twilio not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM missing)");
        }
        try {
            MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
            form.add("To", recipient);
            form.add("From", fromNumber);
            form.add("Body", body == null ? "" : body);

            String basicAuth = Base64.getEncoder().encodeToString(
                    (accountSid + ":" + authToken).getBytes(StandardCharsets.UTF_8));

            JsonNode response = restClient.post()
                    .uri("/2010-04-01/Accounts/{sid}/Messages.json", accountSid)
                    .header("Authorization", "Basic " + basicAuth)
                    .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                    .body(form)
                    .retrieve()
                    .body(JsonNode.class);

            String sid = (response != null && response.hasNonNull("sid"))
                    ? response.get("sid").asText() : "twilio-unknown";
            return DeliveryResult.sent(Channel.SMS, sid, "SMS accepted by Twilio");
        } catch (Exception e) {
            log.warn("Twilio send failed: {}", e.getMessage());
            return DeliveryResult.failed(Channel.SMS, "Twilio error: " + e.getMessage());
        }
    }
}
