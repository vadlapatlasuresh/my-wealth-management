package com.mywealthmanagement.notificationservice.comms.template;

import com.mywealthmanagement.notificationservice.comms.Channel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface MessageTemplateRepository extends JpaRepository<MessageTemplate, Long> {

    /** Latest enabled template for a key+channel+locale (highest version first). */
    Optional<MessageTemplate> findFirstByTemplateKeyAndChannelAndLocaleAndEnabledTrueOrderByVersionDesc(
            String templateKey, Channel channel, String locale);
}
