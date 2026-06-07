package com.mywealthmanagement.platformconfigservice.content;

import com.mywealthmanagement.platformconfigservice.provider.ConfigProvider;
import com.mywealthmanagement.platformconfigservice.provider.dto.DisclaimersDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/content")
@RequiredArgsConstructor
public class ContentController {

    private final ConfigProvider configProvider;
    private final DisclaimerAcceptanceRepository acceptanceRepository;

    @GetMapping("/disclaimers")
    public ResponseEntity<DisclaimersDto> getDisclaimers(
            @RequestParam(value = "keys", required = false) List<String> keys,
            @RequestParam(value = "locale", required = false, defaultValue = "en") String locale) {
        return ResponseEntity.ok(configProvider.getDisclaimers(keys, locale));
    }

    @PostMapping("/disclaimers/accept")
    public ResponseEntity<Map<String, Boolean>> accept(
            @RequestBody Map<String, Object> body,
            Authentication authentication) {
        String key = body == null ? null : String.valueOf(body.get("key"));
        Integer version = parseVersion(body == null ? null : body.get("version"));

        DisclaimerAcceptance acceptance = new DisclaimerAcceptance();
        acceptance.setUserId(Long.parseLong(authentication.getName())); // principal name = userId
        acceptance.setDisclaimerKey(key);
        acceptance.setVersion(version);
        acceptance.setAcceptedAt(LocalDateTime.now());
        acceptanceRepository.save(acceptance);

        return ResponseEntity.ok(Map.of("accepted", true));
    }

    private static Integer parseVersion(Object v) {
        if (v == null) {
            return null;
        }
        if (v instanceof Number n) {
            return n.intValue();
        }
        return Integer.parseInt(v.toString());
    }
}
