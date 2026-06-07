package com.mywealthmanagement.platformconfigservice.app;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "app_section")
@Data
@NoArgsConstructor
public class AppSection {

    @Id
    @Column(name = "id", length = 100)
    private String id;

    @Column(name = "label")
    private String label;

    @Column(name = "sort_order")
    private Integer sortOrder;
}
