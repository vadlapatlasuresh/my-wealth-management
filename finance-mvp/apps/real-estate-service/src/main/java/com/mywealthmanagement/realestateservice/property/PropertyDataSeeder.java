package com.mywealthmanagement.realestateservice.property;

import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class PropertyDataSeeder implements CommandLineRunner {

    private static final Long SEED_USER_ID = 1L;

    private final PropertyRepository propertyRepository;
    private final PropertyValuationProvider valuationProvider;

    @Override
    public void run(String... args) {
        if (!propertyRepository.findByUserId(SEED_USER_ID).isEmpty()) {
            return; // Already seeded
        }

        Property primary = new Property();
        primary.setUserId(SEED_USER_ID);
        primary.setAddress("1842 Elmwood Drive, Austin TX");
        primary.setPropertyType("PRIMARY_RESIDENCE");
        primary.setPurchasePrice(new BigDecimal("250000.0000"));
        primary.setPurchaseDate(LocalDate.of(2018, 6, 15));
        primary.setCurrentValue(new BigDecimal("350000.0000"));
        primary.setMortgageBalance(new BigDecimal("200000.0000"));
        primary.setLastValuedAt(LocalDateTime.now());
        applyDetails(primary);

        Property rental = new Property();
        rental.setUserId(SEED_USER_ID);
        rental.setAddress("456 Oak Ave, Round Rock TX");
        rental.setPropertyType("RENTAL_PROPERTY");
        rental.setPurchasePrice(new BigDecimal("180000.0000"));
        rental.setPurchaseDate(LocalDate.of(2020, 3, 1));
        rental.setCurrentValue(new BigDecimal("240000.0000"));
        rental.setMortgageBalance(new BigDecimal("110000.0000"));
        rental.setLastValuedAt(LocalDateTime.now());
        applyDetails(rental);

        propertyRepository.save(primary);
        propertyRepository.save(rental);
    }

    private void applyDetails(Property property) {
        PropertyEstimate estimate = valuationProvider.lookupDetails(property.getAddress());
        property.setBeds(estimate.beds());
        property.setBaths(estimate.baths());
        property.setSqft(estimate.sqft());
        property.setYearBuilt(estimate.yearBuilt());
        property.setRentEstimate(estimate.rentEstimate());
    }
}
