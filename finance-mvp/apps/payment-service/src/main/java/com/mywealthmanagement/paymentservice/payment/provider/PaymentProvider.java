package com.mywealthmanagement.paymentservice.payment.provider;

import java.math.BigDecimal;

public interface PaymentProvider {

    String createPayment(BigDecimal amount, String currency, String payee);
}
