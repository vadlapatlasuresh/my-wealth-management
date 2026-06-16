package com.mywealthmanagement.authservice.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;

/**
 * Orchestrates the cross-service data purge for account deletion (GDPR/CCPA
 * right-to-delete). For each data service it calls the internal
 * {@code DELETE /internal/users/{id}} (server-to-server, X-Internal-Key).
 * <p>
 * Durable, not best-effort: every (user, target) purge is recorded as a
 * {@link UserDeletionTask}. A target that's down or errors stays {@code PENDING}
 * and is retried by {@link #retryPending()} until it succeeds, so a transient
 * outage never leaves orphaned user data. Audit logs are intentionally retained
 * for compliance and are NOT a target.
 */
@Component
public class UserDataPurgeClient {

    private static final Logger log = LoggerFactory.getLogger(UserDataPurgeClient.class);
    private static final int MAX_ATTEMPTS = 10;

    // Base URLs of services holding user data. MUST be set in prod (compose DNS);
    // the localhost defaults are for local dev only.
    @Value("${purge.targets:http://localhost:8082,http://localhost:8083,http://localhost:8084,http://localhost:8085,http://localhost:8086,http://localhost:8087,http://localhost:8088}")
    private String targetsCsv;

    @Value("${internal.key:${audit.ingest.key:dev-internal-audit-key}}")
    private String internalKey;

    private final RestClient http = RestClient.create();
    private final UserDeletionTaskRepository taskRepository;

    public UserDataPurgeClient(UserDeletionTaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    /** Enqueue a purge task per target and attempt each immediately. */
    public void purgeUser(Long userId) {
        for (String base : targetsCsv.split(",")) {
            String target = base.trim();
            if (target.isEmpty()) continue;
            UserDeletionTask task = taskRepository.findByUserIdAndTarget(userId, target)
                    .orElseGet(() -> {
                        UserDeletionTask t = new UserDeletionTask();
                        t.setUserId(userId);
                        t.setTarget(target);
                        return t;
                    });
            if (!"DONE".equals(task.getStatus())) {
                attempt(task);
                taskRepository.save(task);
            }
        }
    }

    /** Retry purges that haven't completed yet (durability backstop). */
    @Scheduled(fixedDelayString = "${purge.retry.delay-ms:300000}", initialDelayString = "${purge.retry.initial-delay-ms:60000}")
    public void retryPending() {
        List<UserDeletionTask> pending = taskRepository.findByStatusAndAttemptsLessThan("PENDING", MAX_ATTEMPTS);
        if (pending.isEmpty()) return;
        log.info("delete-cascade: retrying {} pending purge task(s)", pending.size());
        for (UserDeletionTask task : pending) {
            attempt(task);
            taskRepository.save(task);
        }
    }

    /** One purge attempt against a single target; updates the task in place. */
    private void attempt(UserDeletionTask task) {
        task.setAttempts(task.getAttempts() + 1);
        try {
            http.delete()
                    .uri(task.getTarget() + "/internal/users/" + task.getUserId())
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .toBodilessEntity();
            task.setStatus("DONE");
            task.setLastError(null);
            log.info("delete-cascade: purged user {} data at {}", task.getUserId(), task.getTarget());
        } catch (Exception e) {
            boolean exhausted = task.getAttempts() >= MAX_ATTEMPTS;
            task.setStatus(exhausted ? "FAILED" : "PENDING");
            task.setLastError(truncate(e.getMessage()));
            log.warn("delete-cascade: attempt {}{} failed for user {} at {}: {}",
                    task.getAttempts(), exhausted ? " (EXHAUSTED — needs manual purge)" : "",
                    task.getUserId(), task.getTarget(), e.getMessage());
        }
    }

    private static String truncate(String s) {
        if (s == null) return null;
        return s.length() > 1000 ? s.substring(0, 1000) : s;
    }
}
