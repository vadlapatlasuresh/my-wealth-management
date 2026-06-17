package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyDto;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/real-estate")
@RequiredArgsConstructor
public class RealEstateController {

    private final PropertyService propertyService;

    @GetMapping
    public ResponseEntity<List<PropertyDto>> getProperties() {
        return ResponseEntity.ok(propertyService.getProperties());
    }

    @PostMapping
    public ResponseEntity<PropertyDto> createProperty(@Valid @RequestBody PropertyDto propertyDto) {
        return ResponseEntity.ok(propertyService.createProperty(propertyDto));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PropertyDto> getProperty(@PathVariable Long id) {
        return ResponseEntity.ok(propertyService.getProperty(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<PropertyDto> updateProperty(@PathVariable Long id, @Valid @RequestBody PropertyDto propertyDto) {
        return ResponseEntity.ok(propertyService.updateProperty(id, propertyDto));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteProperty(@PathVariable Long id) {
        propertyService.deleteProperty(id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/revalue")
    public ResponseEntity<PropertyDto> revalueProperty(@PathVariable Long id) {
        return ResponseEntity.ok(propertyService.revalue(id));
    }

    @PostMapping("/lookup")
    public ResponseEntity<PropertyEstimate> lookup(@RequestBody Map<String, Object> body) {
        Object address = body == null ? null : body.get("address");
        return ResponseEntity.ok(propertyService.lookup(address == null ? null : address.toString()));
    }
}
