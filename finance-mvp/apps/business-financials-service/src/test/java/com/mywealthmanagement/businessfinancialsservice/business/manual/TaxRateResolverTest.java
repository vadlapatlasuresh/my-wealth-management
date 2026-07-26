package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Jurisdiction matching for the sales-tax engine (order-to-cash Phase 1.7). */
class TaxRateResolverTest {

    private BusinessTaxRate rate(String name, String pct, String country, String region, String postal, boolean isDefault, boolean active) {
        BusinessTaxRate r = new BusinessTaxRate();
        r.setName(name);
        r.setRate(new BigDecimal(pct));
        r.setCountry(country);
        r.setRegion(region);
        r.setPostal(postal);
        r.setDefault(isDefault);
        r.setActive(active);
        return r;
    }

    @Test
    void mostSpecificMatchWins() {
        List<BusinessTaxRate> rates = List.of(
                rate("US default", "5", "US", null, null, false, true),
                rate("CA state", "7.25", "US", "CA", null, false, true),
                rate("SF ZIP", "8.625", "US", "CA", "94103", false, true));

        assertThat(TaxRateResolver.resolve(rates, "US", "CA", "94103").getRate()).isEqualByComparingTo("8.625"); // postal
        assertThat(TaxRateResolver.resolve(rates, "US", "CA", "90001").getRate()).isEqualByComparingTo("7.25");  // region
        assertThat(TaxRateResolver.resolve(rates, "US", "TX", "73301").getRate()).isEqualByComparingTo("5");     // country
    }

    @Test
    void regionMatchIsCaseInsensitive() {
        List<BusinessTaxRate> rates = List.of(rate("CA state", "7.25", "US", "ca", null, false, true));
        assertThat(TaxRateResolver.resolve(rates, "us", "CA", null).getRate()).isEqualByComparingTo("7.25");
    }

    @Test
    void fallsBackToDefaultThenNull() {
        List<BusinessTaxRate> withDefault = List.of(
                rate("VAT", "20", "GB", null, null, false, true),
                rate("House rate", "6", null, null, null, true, true));
        // Nothing matches FR -> default.
        assertThat(TaxRateResolver.resolve(withDefault, "FR", "IDF", "75001").getRate()).isEqualByComparingTo("6");

        List<BusinessTaxRate> noDefault = List.of(rate("VAT", "20", "GB", null, null, false, true));
        assertThat(TaxRateResolver.resolve(noDefault, "FR", null, null)).isNull();
    }

    @Test
    void inactiveRatesAreIgnored() {
        List<BusinessTaxRate> rates = List.of(
                rate("CA state (off)", "7.25", "US", "CA", null, false, false),
                rate("US default", "5", "US", null, null, false, true));
        assertThat(TaxRateResolver.resolve(rates, "US", "CA", null).getRate()).isEqualByComparingTo("5");
    }
}
