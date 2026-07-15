package com.mywealthmanagement.businessfinancialsservice.comms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Best-effort bridge to the documents-service cross-app registry. When a business
 * document is uploaded here, we also register it in the user's personal Document
 * Center so that center stays the single source of truth for all of their files.
 * Registration is a reference (EXTERNAL_REF) back to this service's document — the
 * bytes are not copied. Every failure is swallowed and logged: registering must
 * never block or fail the upload.
 */
@Component
public class DocumentsRegistryClient {

    private static final Logger log = LoggerFactory.getLogger(DocumentsRegistryClient.class);

    private final RestClient restClient;
    private final String internalKey;
    private final boolean enabled;

    public DocumentsRegistryClient(
            @Value("${service.documents.url:http://localhost:8091}") String documentsUrl,
            @Value("${documents.internal.key:${AUDIT_INGEST_KEY:dev-internal-audit-key}}") String internalKey,
            @Value("${documents.registry.enabled:true}") boolean enabled) {
        this.restClient = RestClient.builder().baseUrl(documentsUrl).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    /**
     * Register (or update) a business document in the personal Document Center.
     * {@code sourceRef} is this service's document id, so re-registering is idempotent.
     */
    public void register(Long userId, Long businessDocId, String label, String docType,
                         String contentType, Long sizeBytes, String originalFilename) {
        if (!enabled || userId == null || businessDocId == null) {
            return;
        }
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("userId", userId);
            payload.put("sourceService", "business");
            payload.put("sourceRef", String.valueOf(businessDocId));
            payload.put("label", label);
            payload.put("docType", docType);
            payload.put("storageType", "EXTERNAL_REF");
            payload.put("contentType", contentType);
            payload.put("sizeBytes", sizeBytes);
            payload.put("originalFilename", originalFilename);
            restClient.post()
                    .uri("/internal/documents/register")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("registering business doc {} for user {} in document center failed: {}",
                    businessDocId, userId, e.getMessage());
        }
    }
}
