package com.mywealthmanagement.paymentservice.payment;

import com.mywealthmanagement.paymentservice.payment.dto.BillPayIntentDto;
import com.mywealthmanagement.paymentservice.payment.provider.PaymentProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PaymentService {

    private final BillPayIntentRepository repository;
    private final PaymentProvider paymentProvider;
    private final com.mywealthmanagement.paymentservice.audit.AuditClient auditClient;
    private final ReminderNotifier reminderNotifier;

    private Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public List<BillPayIntentDto> getIntents() {
        return getIntents(currentUserId());
    }

    /** Same, for an explicit user — used by the customer-care read-only view. */
    public List<BillPayIntentDto> getIntents(Long userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId).stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public BillPayIntentDto getIntent(Long id) {
        Long userId = currentUserId();
        BillPayIntent intent = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill pay intent not found"));
        return toDto(intent);
    }

    public BillPayIntentDto createIntent(Map<String, Object> body) {
        Long userId = currentUserId();

        // Idempotency: if the client supplies a key and we've already seen it,
        // return the existing intent instead of creating a duplicate payment.
        String idempotencyKey = parseString(body.get("idempotencyKey"));
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            idempotencyKey = parseString(body.get("idempotency_key"));
        }
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Optional<BillPayIntent> existing =
                    repository.findByUserIdAndIdempotencyKey(userId, idempotencyKey);
            if (existing.isPresent()) {
                return toDto(existing.get());
            }
        }

        BigDecimal amount = parseAmount(body.get("amount"));
        if (amount.compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Payment amount must be greater than zero");
        }

        String currency = parseString(body.get("currency"));
        if (currency == null || currency.isBlank()) {
            currency = "USD";
        }

        String fromAccount = firstNonNull(
                parseString(body.get("fromAccountId")),
                parseString(body.get("funding_account_id")),
                parseString(body.get("from_account"))
        );
        if (fromAccount == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A funding account is required");
        }

        String toAccount = firstNonNull(
                parseString(body.get("toAccountId")),
                parseString(body.get("to_account_id")),
                parseString(body.get("card_account_id")),
                parseString(body.get("to_account"))
        );
        String payee = parseString(body.get("payee"));
        String payeeType = parseString(body.get("payeeType"));
        if (payeeType == null) payeeType = parseString(body.get("payee_type"));
        String memo = parseString(body.get("memo"));

        LocalDate today = LocalDate.now();
        LocalDate scheduledDate = parseDate(firstNonNull(
                parseString(body.get("scheduledDate")),
                parseString(body.get("scheduled_date"))
        ));
        if (scheduledDate != null && scheduledDate.isBefore(today)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Scheduled date cannot be in the past");
        }
        boolean isScheduled = scheduledDate != null && scheduledDate.isAfter(today);
        if (scheduledDate == null) {
            scheduledDate = today;
        }

        // Hand off to the payment provider (mock by default; Stripe/ACH in prod).
        String providerRef = paymentProvider.createPayment(amount, currency, payee);

        BillPayIntent intent = new BillPayIntent();
        intent.setUserId(userId);
        intent.setAmount(amount);
        intent.setCurrency(currency);
        intent.setPayee(payee);
        intent.setPayeeType(payeeType);
        intent.setFromAccount(fromAccount);
        intent.setToAccount(toAccount);
        intent.setMemo(memo);
        intent.setScheduledDate(scheduledDate);
        // Future-dated payments wait as SCHEDULED; immediate ones settle now (mock).
        intent.setStatus(isScheduled ? "SCHEDULED" : "COMPLETED");
        intent.setProviderRef(providerRef);
        intent.setConfirmationNumber(generateConfirmation());
        intent.setIdempotencyKey(
                idempotencyKey != null && !idempotencyKey.isBlank() ? idempotencyKey : null);

        BillPayIntent saved = repository.save(intent);
        auditClient.record(String.valueOf(userId), "billpay.create", "SUCCESS",
                "intentId=" + saved.getId() + ";amount=" + amount + ";status=" + saved.getStatus());

        // Best-effort receipt: a payment that settled immediately gets a "payment sent"
        // notification with the amount, payee, funding + destination account and confirmation.
        // Scheduled (future-dated) payments are covered by the tiered reminders instead.
        if ("COMPLETED".equals(saved.getStatus())) {
            reminderNotifier.confirmPayment(userId, saved.getAmount(), saved.getPayee(),
                    saved.getFromAccount(), saved.getToAccount(), saved.getConfirmationNumber());
        }
        return toDto(saved);
    }

    public BillPayIntentDto cancelIntent(Long id) {
        Long userId = currentUserId();
        BillPayIntent intent = repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill pay intent not found"));
        String status = intent.getStatus();
        if (!"SCHEDULED".equals(status) && !"PENDING".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only scheduled or pending payments can be canceled");
        }
        intent.setStatus("CANCELED");
        return toDto(repository.save(intent));
    }

    private String generateConfirmation() {
        return "TVP-" + UUID.randomUUID().toString().replace("-", "")
                .substring(0, 8).toUpperCase();
    }

    private BillPayIntentDto toDto(BillPayIntent intent) {
        String intentId = intent.getId() != null
                ? String.valueOf(intent.getId())
                : intent.getProviderRef();
        BillPayIntentDto dto = new BillPayIntentDto();
        dto.setIntentId(intentId);
        dto.setAmount(intent.getAmount());
        dto.setCurrency(intent.getCurrency());
        dto.setStatus(intent.getStatus());
        dto.setPayee(intent.getPayee());
        dto.setPayeeType(intent.getPayeeType());
        dto.setFromAccount(intent.getFromAccount());
        dto.setToAccount(intent.getToAccount());
        dto.setScheduledDate(intent.getScheduledDate());
        dto.setMemo(intent.getMemo());
        dto.setConfirmationNumber(intent.getConfirmationNumber());
        dto.setCreatedAt(intent.getCreatedAt());
        return dto;
    }

    private BigDecimal parseAmount(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        if (value instanceof Number number) {
            return new BigDecimal(number.toString());
        }
        try {
            return new BigDecimal(value.toString().trim());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid amount");
        }
    }

    private LocalDate parseDate(Object value) {
        if (value == null) {
            return null;
        }
        String s = value.toString().trim();
        if (s.isEmpty()) {
            return null;
        }
        try {
            // Accept ISO date (YYYY-MM-DD) or full ISO date-time; use the date part.
            return LocalDate.parse(s.length() >= 10 ? s.substring(0, 10) : s);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid scheduled date (use YYYY-MM-DD)");
        }
    }

    private String parseString(Object value) {
        return value != null ? value.toString() : null;
    }

    private String firstNonNull(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
