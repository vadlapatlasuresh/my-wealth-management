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
        property.setPropertyType(dto.getPropertyType());
        property.setPurchasePrice(dto.getPurchasePrice());
        property.setPurchaseDate(dto.getPurchaseDate());
        property.setCurrentValue(dto.getCurrentValue());
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
                property.getRentEstimate()
        );
    }

    public PropertyEstimate lookup(String address) {
        return valuationProvider.lookupDetails(address);
    }
}
