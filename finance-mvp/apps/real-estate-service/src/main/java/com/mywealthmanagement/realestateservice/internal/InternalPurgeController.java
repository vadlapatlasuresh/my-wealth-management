package com.mywealthmanagement.realestateservice.internal;

import com.mywealthmanagement.realestateservice.deal.DealRepository;
import com.mywealthmanagement.realestateservice.deal.DealWatchRepository;
import com.mywealthmanagement.realestateservice.property.PropertyRepository;
import com.mywealthmanagement.realestateservice.sponsor.SponsorProjectRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/** Purges all real-estate data for a user on account deletion. X-Internal-Key guarded. */
@RestController
@RequestMapping("/internal/users")
@RequiredArgsConstructor
public class InternalPurgeController {

    private final DealWatchRepository dealWatchRepository;
    private final DealRepository dealRepository;
    private final PropertyRepository propertyRepository;
    private final SponsorProjectRepository sponsorProjectRepository;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    @DeleteMapping("/{userId}")
    @Transactional
    public ResponseEntity<Void> purge(@PathVariable Long userId,
                                      @RequestHeader(value = "X-Internal-Key", required = false) String key) {
        if (StringUtils.hasText(internalKey) && !internalKey.equals(key)) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Invalid internal key");
        }
        dealWatchRepository.deleteByUserId(userId);   // watches/interests first
        sponsorProjectRepository.deleteByUserId(userId);
        dealRepository.deleteByUserId(userId);
        propertyRepository.deleteByUserId(userId);
        return ResponseEntity.noContent().build();
    }
}
