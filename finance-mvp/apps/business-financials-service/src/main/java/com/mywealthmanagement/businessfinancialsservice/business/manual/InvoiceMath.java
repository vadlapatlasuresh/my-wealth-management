package com.mywealthmanagement.businessfinancialsservice.business.manual;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Shared money math for invoices and quotes: given a line-item subtotal, apply a discount
 * (absolute or percent, never below zero) then tax, producing the grand total. Kept in one
 * place so an invoice and the quote it was converted from compute identical totals.
 */
public final class InvoiceMath {

    private InvoiceMath() {}

    public static final BigDecimal HUNDRED = new BigDecimal("100");

    /** The computed breakdown. discountType/discountValue/taxRate are normalized (null when unused). */
    public record Breakdown(
            BigDecimal subtotal,
            String discountType,
            BigDecimal discountValue,
            BigDecimal discountAmount,
            BigDecimal taxRate,
            BigDecimal taxAmount,
            BigDecimal total) {}

    public static Breakdown compute(BigDecimal subtotalIn, String discountType, BigDecimal discountValue, BigDecimal taxRate) {
        BigDecimal subtotal = (subtotalIn == null ? BigDecimal.ZERO : subtotalIn).setScale(2, RoundingMode.HALF_UP);

        BigDecimal discAmt = BigDecimal.ZERO;
        if ("PERCENT".equals(discountType) && discountValue != null) {
            discAmt = subtotal.multiply(discountValue).divide(HUNDRED, 2, RoundingMode.HALF_UP);
        } else if ("AMOUNT".equals(discountType) && discountValue != null) {
            discAmt = discountValue.setScale(2, RoundingMode.HALF_UP);
        } else {
            discountType = null;
            discountValue = null;
        }
        if (discAmt.signum() < 0) discAmt = BigDecimal.ZERO;
        if (discAmt.compareTo(subtotal) > 0) discAmt = subtotal;   // never discount below zero

        BigDecimal taxable = subtotal.subtract(discAmt);
        boolean taxed = taxRate != null && taxRate.signum() > 0;
        BigDecimal taxAmt = taxed
                ? taxable.multiply(taxRate).divide(HUNDRED, 2, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;
        BigDecimal total = taxable.add(taxAmt).setScale(2, RoundingMode.HALF_UP);

        return new Breakdown(subtotal, discountType, discountValue, discAmt, taxed ? taxRate : null, taxAmt, total);
    }
}
