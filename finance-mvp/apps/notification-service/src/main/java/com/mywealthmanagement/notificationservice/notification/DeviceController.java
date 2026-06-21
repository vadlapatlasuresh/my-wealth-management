package com.mywealthmanagement.notificationservice.notification;

import com.mywealthmanagement.notificationservice.comms.Channel;
import com.mywealthmanagement.notificationservice.comms.ChannelRouter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Push device registration + client config.
 *
 * The browser/native app obtains an FCM registration token and registers it here; push
 * notifications then fan out to every token a user has. {@code GET /push/config} tells the
 * client whether push is enabled server-side and hands it the PUBLIC web-push config
 * (Firebase web config + VAPID key) so it can mint a token — mirrors the OAuth config
 * pattern. All inert until {@code comms.provider.push=fcm} + the keys are set.
 */
@RestController
@RequestMapping("/api/v1/notifications")
public class DeviceController {

    private final DeviceTokenRepository repository;
    private final ChannelRouter channelRouter;
    private final String vapidKey;
    private final String firebaseConfig;

    public DeviceController(DeviceTokenRepository repository,
                            ChannelRouter channelRouter,
                            @Value("${push.web.vapid-key:}") String vapidKey,
                            @Value("${push.web.firebase-config:}") String firebaseConfig) {
        this.repository = repository;
        this.channelRouter = channelRouter;
        this.vapidKey = vapidKey;
        this.firebaseConfig = firebaseConfig;
    }

    /** Whether push is live + the public client config needed to acquire a token. */
    @GetMapping("/push/config")
    public Map<String, Object> config() {
        boolean enabled = "fcm".equals(channelRouter.providerFor(Channel.PUSH) == null
                ? "mock" : channelRouter.providerFor(Channel.PUSH).name());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("enabled", enabled);
        out.put("vapidKey", vapidKey == null ? "" : vapidKey);
        // Public Firebase web config (JSON string), used by the browser SDK to getToken().
        out.put("firebaseConfig", firebaseConfig == null ? "" : firebaseConfig);
        return out;
    }

    /** Register (or refresh) the caller's device token. */
    @PostMapping("/devices")
    public ResponseEntity<Map<String, Boolean>> register(@RequestBody Map<String, String> body,
                                                         Authentication authentication) {
        if (body == null || !StringUtils.hasText(body.get("token"))) {
            return ResponseEntity.badRequest().body(Map.of("registered", false));
        }
        String token = body.get("token");
        Long userId = Long.parseLong(authentication.getName());

        // Idempotent: if the token already exists, re-point it at this user; else create.
        String platform = body.get("platform");
        DeviceToken dt = repository.findByToken(token).orElseGet(DeviceToken::new);
        dt.setUserId(userId);
        dt.setToken(token);
        dt.setPlatform(StringUtils.hasText(platform) ? platform : "web");
        if (dt.getCreatedAt() == null) dt.setCreatedAt(LocalDateTime.now());
        repository.save(dt);
        return ResponseEntity.ok(Map.of("registered", true));
    }

    /** Unregister a device token (e.g. user turned push off, or signed out). */
    @DeleteMapping("/devices")
    @org.springframework.transaction.annotation.Transactional
    public ResponseEntity<Void> unregister(@RequestBody Map<String, String> body,
                                           Authentication authentication) {
        String token = body == null ? null : body.get("token");
        if (StringUtils.hasText(token)) {
            repository.findByToken(token)
                    .filter(d -> d.getUserId().equals(Long.parseLong(authentication.getName())))
                    .ifPresent(d -> repository.deleteByToken(token));
        }
        return ResponseEntity.status(HttpStatus.NO_CONTENT).build();
    }
}
