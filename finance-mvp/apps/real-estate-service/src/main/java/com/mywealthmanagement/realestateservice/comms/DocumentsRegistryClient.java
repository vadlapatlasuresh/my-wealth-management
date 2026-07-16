package com.mywealthmanagement.realestateservice.comms;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.HashMap;
import java.util.Map;

/**
 * Best-effort bridge to the documents-service cross-app registry. When a document
 * link is attached to a deal, we also register it in the deal owner's personal
 * Document Center so that center stays the single source of truth for all of their
 * files. Deal documents are link-based, so we register a LINK (the sponsor-hosted
 * URL) keyed on this service's document id. Every failure is swallowed and logged:
 * registering must never block or fail attaching the document.
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
        // Short timeouts: registration is a best-effort side-effect on the request thread,
        // so a slow/hung documents-service must never stall attaching a deal document.
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(3000);
        this.restClient = RestClient.builder().baseUrl(documentsUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
        this.enabled = enabled;
    }

    /** Register (or update) a deal document link in the owner's personal Document Center. */
    public void register(Long ownerUserId, Long dealDocId, String label, String docType, String url) {
        if (!enabled || ownerUserId == null || dealDocId == null) {
            return;
        }
        try {
            Map<String, Object> payload = new HashMap<>();
            payload.put("userId", ownerUserId);
            payload.put("sourceService", "deal");
            payload.put("sourceRef", String.valueOf(dealDocId));
            payload.put("label", label);
            payload.put("docType", docType);
            payload.put("storageType", "LINK");
            payload.put("url", url);
            restClient.post()
                    .uri("/internal/documents/register")
                    .header("X-Internal-Key", internalKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(payload)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("registering deal doc {} for user {} in document center failed: {}",
                    dealDocId, ownerUserId, e.getMessage());
        }
    }

    /** Remove a deal document from the owner's personal Document Center (on delete). */
    public void unregister(Long ownerUserId, Long dealDocId) {
        if (!enabled || ownerUserId == null || dealDocId == null) {
            return;
        }
        try {
            restClient.delete()
                    .uri(uri -> uri.path("/internal/documents/register")
                            .queryParam("userId", ownerUserId)
                            .queryParam("sourceService", "deal")
                            .queryParam("sourceRef", String.valueOf(dealDocId))
                            .build())
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            log.warn("unregistering deal doc {} for user {} from document center failed: {}",
                    dealDocId, ownerUserId, e.getMessage());
        }
    }
}
