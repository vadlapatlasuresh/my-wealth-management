package com.mywealthmanagement.realestateservice.property;

import java.math.BigDecimal;

public interface PropertyValuationProvider {
    BigDecimal estimateValue(String address, BigDecimal purchasePrice);

    PropertyEstimate lookupDetails(String address);
}
