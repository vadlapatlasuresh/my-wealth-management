package com.mywealthmanagement.notificationservice.comms.template;

import com.mywealthmanagement.notificationservice.comms.Channel;
import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * DB-driven message template. Editing copy/subject is a row change, not a code change.
 */
@Entity
@Table(name = "message_template")
@Data
@NoArgsConstructor
public class MessageTemplate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "template_key", nullable = false)
    private String templateKey;

    @Enumerated(EnumType.STRING)
    @Column(name = "channel", nullable = false)
    private Channel channel;

    @Column(name = "locale", nullable = false)
    private String locale;

    @Column(name = "subject")
    private String subject;

    @Column(name = "body", nullable = false, length = 4000)
    private String body;

    @Column(name = "variables")
    private String variables;

    @Column(name = "version", nullable = false)
    private int version;

    @Column(name = "enabled", nullable = false)
    private boolean enabled;
}
