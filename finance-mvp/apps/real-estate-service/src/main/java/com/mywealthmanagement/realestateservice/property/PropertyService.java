package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class PropertyService {

    private final PropertyRepository propertyRepository;
    private final PropertyValuationProvider valuationProvider;

    // Helper to get userId from authenticated context
    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    public List<PropertyDto> getProperties() {
        return propertyRepository.findByUserId(getUserId()).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    public PropertyDto getProperty(Long id) {
        return convertToDto(findOwnedOrThrow(id));
    }

    public PropertyDto createProperty(PropertyDto dto) {
        Property property = new Property();
        property.setUserId(getUserId());
        applyEditableFields(property, dto);
        return convertToDto(propertyRepository.save(property));
    }

    public PropertyDto updateProperty(Long id, PropertyDto dto) {
        Property property = findOwnedOrThrow(id);
        applyEditableFields(property, dto);
        return convertToDto(propertyRepository.save(property));
    }

    public void deleteProperty(Long id) {
        Property property = findOwnedOrThrow(id);
        propertyRepository.delete(property);
    }

    public PropertyDto revalue(Long id) {
        Property property = findOwnedOrThrow(id);
        BigDecimal estimate = valuationProvider.estimateValue(property.getAddress(), property.getPurchasePrice());
        property.setCurrentValue(estimate);
        property.setLastValuedAt(LocalDateTime.now());
        return convertToDto(propertyRepository.save(property));
    }

    private Property findOwnedOrThrow(Long id) {
        Property property = propertyRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Property not found"));
        if (!property.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Property not found");
        }
        return property;
    }

    private void applyEditableFields(Property property, PropertyDto dto) {
        property.setAddress(dto.getAddress());

        // NOT NULL columns must always end up set so a property can be saved with
        // just an address (value auto-estimated later). Prefer the incoming value,
        // then keep any existing value, then a sensible default.
        String type = firstNonBlank(dto.getPropertyType(), property.getPropertyType(), "PRIMARY_RESIDENCE");
        property.setPropertyType(type);

        BigDecimal currentValue = firstNonNull(dto.getCurrentValue(), property.getCurrentValue(), BigDecimal.ZERO);
        property.setCurrentValue(currentValue);

        // Purchase price defaults to the current value when unknown (NOT NULL column).
        property.setPurchasePrice(firstNonNull(dto.getPurchasePrice(), property.getPurchasePrice(), currentValue));

        property.setPurchaseDate(dto.getPurchaseDate());
        property.setMortgageBalance(dto.getMortgageBalance());
        property.setLastValuedAt(dto.getLastValuedAt());
        if (dto.getBeds() != null) {
            property.setBeds(dto.getBeds());
        }
        if (dto.getBaths() != null) {
            property.setBaths(dto.getBaths());
        }
        if (dto.getSqft() != null) {
            property.setSqft(dto.getSqft());
        }
        if (dto.getYearBuilt() != null) {
            property.setYearBuilt(dto.getYearBuilt());
        }
        if (dto.getRentEstimate() != null) {
            property.setRentEstimate(dto.getRentEstimate());
        }
        // Financing & carrying costs — only overwrite when supplied, so a partial
        // update never wipes existing values.
        if (dto.getApr() != null) {
            property.setApr(dto.getApr());
        }
        if (dto.getMonthlyPayment() != null) {
            property.setMonthlyPayment(dto.getMonthlyPayment());
        }
        if (dto.getMonthlyTax() != null) {
            property.setMonthlyTax(dto.getMonthlyTax());
        }
        if (dto.getMonthlyInsurance() != null) {
            property.setMonthlyInsurance(dto.getMonthlyInsurance());
        }
        if (dto.getMonthlyHoa() != null) {
            property.setMonthlyHoa(dto.getMonthlyHoa());
        }
        if (dto.getMonthlyPmi() != null) {
            property.setMonthlyPmi(dto.getMonthlyPmi());
        }
    }

    private static String firstNonBlank(String... values) {
        for (String v : values) {
            if (v != null && !v.isBlank()) return v;
        }
        return null;
    }

    private static BigDecimal firstNonNull(BigDecimal... values) {
        for (BigDecimal v : values) {
            if (v != null) return v;
        }
        return BigDecimal.ZERO;
    }

    private PropertyDto convertToDto(Property property) {
        BigDecimal currentValue = property.getCurrentValue() == null ? BigDecimal.ZERO : property.getCurrentValue();
        BigDecimal mortgageBalance = property.getMortgageBalance() == null ? BigDecimal.ZERO : property.getMortgageBalance();
        BigDecimal equity = currentValue.subtract(mortgageBalance);
        return new PropertyDto(
                property.getId(),
                property.getAddress(),
                property.getPropertyType(),
                property.getPurchasePrice(),
                property.getPurchaseDate(),
                property.getCurrentValue(),
                property.getMortgageBalance(),
                equity,
                property.getLastValuedAt(),
                property.getBeds(),
                property.getBaths(),
                property.getSqft(),
                property.getYearBuilt(),
                property.getRentEstimate(),
                property.getApr(),
                property.getMonthlyPayment(),
                property.getMonthlyTax(),
                property.getMonthlyInsurance(),
                property.getMonthlyHoa(),
                property.getMonthlyPmi()
        );
    }

    public PropertyEstimate lookup(String address) {
        return valuationProvider.lookupDetails(address);
    }
}
