package com.mywealthmanagement.businessfinancialsservice.business.pay;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.mywealthmanagement.businessfinancialsservice.business.manual.BusinessInvoice;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.RoundingMode;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Real card / ACH acceptance via Stripe Checkout — activated by
 * {@code payments.invoice.provider=stripe} + {@code payments.invoice.stripe.secret-key}.
 * Uses Stripe's REST API directly (no SDK): a Checkout Session is created for the invoice
 * amount, and payment is confirmed by reading the session's payment_status on return (so no
 * webhook secret is required). ACH maps to Stripe's {@code us_bank_account} method.
 */
@Service
@Primary
@ConditionalOnProperty(name = "payments.invoice.provider", havingValue = "stripe")
public class StripeInvoicePaymentProvider implements InvoicePaymentProvider {

    private static final Logger log = LoggerFactory.getLogger(StripeInvoicePaymentProvider.class);
    private static final String API = "https://api.stripe.com/v1";

    private final String secretKey;
    private final String currency;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper = new ObjectMapper();

    public StripeInvoicePaymentProvider(
            @Value("${payments.invoice.stripe.secret-key:}") String secretKey,
            @Value("${payments.invoice.currency:usd}") String currency) {
        this.secretKey = secretKey;
        this.currency = currency;
    }

    @Override
    public Checkout createCheckout(BusinessInvoice inv, String method, String publicBaseUrl) {
        long cents = inv.getAmount().setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
        String base = publicBaseUrl == null ? "" : publicBaseUrl.replaceAll("/+$", "");
        String returnBase = base + "/invoice/" + inv.getShareToken();
        String pmType = "ACH".equalsIgnoreCase(method) || "ECHECK".equalsIgnoreCase(method) ? "us_bank_account" : "card";

        Map<String, String> form = new LinkedHashMap<>();
        form.put("mode", "payment");
        form.put("success_url", returnBase + "?paid={CHECKOUT_SESSION_ID}");
        form.put("cancel_url", returnBase);
        form.put("payment_method_types[0]", pmType);
        form.put("client_reference_id", String.valueOf(inv.getId()));
        form.put("line_items[0][quantity]", "1");
        form.put("line_items[0][price_data][currency]", currency);
        form.put("line_items[0][price_data][unit_amount]", String.valueOf(cents));
        form.put("line_items[0][price_data][product_data][name]",
                "Invoice" + (inv.getInvoiceNumber() != null ? " #" + inv.getInvoiceNumber() : "") + " — " + inv.getCustomer());

        JsonNode session = post("/checkout/sessions", form);
        return new Checkout(session.path("url").asText(), session.path("id").asText(), "stripe");
    }

    @Override
    public boolean verifyPaid(String ref, BusinessInvoice inv) {
        if (ref == null || ref.isBlank()) return false;
        try {
            JsonNode session = get("/checkout/sessions/" + ref);
            boolean paid = "paid".equals(session.path("payment_status").asText());
            // Guard against tampering: the session must be for this invoice and full amount.
            long cents = inv.getAmount().setScale(2, RoundingMode.HALF_UP).movePointRight(2).longValueExact();
            boolean matches = String.valueOf(inv.getId()).equals(session.path("client_reference_id").asText())
                    && session.path("amount_total").asLong() >= cents;
            return paid && matches;
        } catch (RuntimeException e) {
            log.warn("stripe: verify {} failed: {}", ref, e.getMessage());
            return false;
        }
    }

    @Override
    public String name() {
        return "stripe";
    }

    @Override
    public boolean live() {
        return secretKey != null && !secretKey.isBlank();
    }

    /* ---- minimal Stripe REST helpers ---- */

    private JsonNode post(String path, Map<String, String> form) {
        StringBuilder body = new StringBuilder();
        form.forEach((k, v) -> {
            if (body.length() > 0) body.append('&');
            body.append(URLEncoder.encode(k, StandardCharsets.UTF_8)).append('=')
                    .append(URLEncoder.encode(v, StandardCharsets.UTF_8));
        });
        HttpRequest req = HttpRequest.newBuilder(URI.create(API + path))
                .header("Authorization", "Bearer " + secretKey)
                .header("Content-Type", "application/x-www-form-urlencoded")
                .timeout(Duration.ofSeconds(15))
                .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();
        return send(req);
    }

    private JsonNode get(String path) {
        HttpRequest req = HttpRequest.newBuilder(URI.create(API + path))
                .header("Authorization", "Bearer " + secretKey)
                .timeout(Duration.ofSeconds(15))
                .GET()
                .build();
        return send(req);
    }

    private JsonNode send(HttpRequest req) {
        try {
            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            JsonNode json = mapper.readTree(resp.body());
            if (resp.statusCode() >= 300) {
                String msg = json.path("error").path("message").asText("Stripe request failed");
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Payment processor: " + msg);
            }
            return json;
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Payment processor unavailable");
        }
    }
}
