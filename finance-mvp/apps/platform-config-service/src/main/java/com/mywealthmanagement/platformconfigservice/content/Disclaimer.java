package com.mywealthmanagement.platformconfigservice.content;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "disclaimer",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_disclaimer_key_locale_version",
                columnNames = {"disclaimer_key", "locale", "version"}))
@Data
@NoArgsConstructor
public class Disclaimer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "disclaimer_key", nullable = false, length = 200)
    private String disclaimerKey;

    @Column(name = "version", nullable = false)
    private Integer version;

    @Column(name = "locale", nullable = false, length = 20)
    private String locale;

    @Column(name = "title")
    private String title;

    @Lob
    @Column(name = "body_markdown")
    private String bodyMarkdown;

    @Column(name = "requires_acceptance")
    private Boolean requiresAcceptance;

    @Column(name = "effective_at")
    private LocalDateTime effectiveAt;
}
