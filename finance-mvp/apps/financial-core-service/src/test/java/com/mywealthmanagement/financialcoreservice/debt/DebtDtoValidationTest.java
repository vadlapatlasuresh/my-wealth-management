package com.mywealthmanagement.financialcoreservice.debt;

import com.mywealthmanagement.financialcoreservice.debt.dto.DebtDto;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Validates that a debt with a missing required numeric (e.g. apr) is rejected by
 * bean validation -> the controller returns 400, not a DB-not-null 500.
 */
class DebtDtoValidationTest {

    private static ValidatorFactory factory;
    private static Validator validator;

    @BeforeAll
    static void setup() {
        factory = Validation.buildDefaultValidatorFactory();
        validator = factory.getValidator();
    }

    @AfterAll
    static void tearDown() {
        factory.close();
    }

    private DebtDto valid() {
        return new DebtDto(null, "Visa", new BigDecimal("1000"), new BigDecimal("19.99"), new BigDecimal("50"), null);
    }

    @Test
    void plaidAccountIdIsOptional() {
        DebtDto d = valid();
        d.setPlaidAccountId("acct_123");
        assertThat(validator.validate(d)).isEmpty();
    }

    @Test
    void validDebtPasses() {
        assertThat(validator.validate(valid())).isEmpty();
    }

    @Test
    void nullAprIsRejected() {
        DebtDto d = valid();
        d.setApr(null);
        assertThat(validator.validate(d)).anyMatch(v -> v.getPropertyPath().toString().equals("apr"));
    }

    @Test
    void nullBalanceAndMinPaymentAreRejected() {
        DebtDto d = valid();
        d.setBalance(null);
        d.setMinPayment(null);
        assertThat(validator.validate(d)).hasSizeGreaterThanOrEqualTo(2);
    }

    @Test
    void negativeAprStillRejected() {
        DebtDto d = valid();
        d.setApr(new BigDecimal("-1"));
        assertThat(validator.validate(d)).anyMatch(v -> v.getPropertyPath().toString().equals("apr"));
    }
}
