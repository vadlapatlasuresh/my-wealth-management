package com.mywealthmanagement.businessfinancialsservice.internal;

import com.mywealthmanagement.businessfinancialsservice.business.QboConnectionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Purges business-financials data (QuickBooks connection) for a user on account deletion. */
@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalPurgeController {

    private final QboConnectionRepository qboConnectionRepository;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<Void> purge(@PathVariable Long userId,
                                      @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        qboConnectionRepository.deleteByUserId(userId);
        return ResponseEntity.noContent().build();
    }
}
