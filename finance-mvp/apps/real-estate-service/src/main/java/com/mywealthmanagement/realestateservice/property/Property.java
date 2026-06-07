package com.mywealthmanagement.realestateservice.property;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "properties")
@Data
@NoArgsConstructor
public class Property {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 500)
    private String address;

    // 'type' is a SQL reserved word, so we use propertyType mapped to column "property_type"
    @Column(name = "property_type", nullable = false, length = 50)
    private String propertyType; // PRIMARY_RESIDENCE | RENTAL_PROPERTY | LAND

    @Column(name = "purchase_price", nullable = false)
    private BigDecimal purchasePrice;

    @Column(name = "purchase_date")
    private LocalDate purchaseDate;

    @Column(name = "current_value")
    private BigDecimal currentValue;

    @Column(name = "mortgage_balance")
    private BigDecimal mortgageBalance;

    @Column(name = "last_valued_at")
    private LocalDateTime lastValuedAt;

    @Column(name = "beds")
    private Integer beds;

    @Column(name = "baths")
    private BigDecimal baths;

    @Column(name = "sqft")
    private Integer sqft;

    @Column(name = "year_built")
    private Integer yearBuilt;

    @Column(name = "rent_estimate")
    private BigDecimal rentEstimate;
}
