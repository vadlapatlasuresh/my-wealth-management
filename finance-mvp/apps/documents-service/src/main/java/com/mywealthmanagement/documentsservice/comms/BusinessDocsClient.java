package com.mywealthmanagement.documentsservice.comms;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

/**
 * Fetches the bytes of an uploaded business document from business-financials-service
 * (shared X-Internal-Key). Used when a recipient opens a business file that was shared
 * through the personal Document Center — the file is registered here as an EXTERNAL_REF
 * (sourceService = "business") but its bytes live in the business service's storage.
 */
@Component
public class BusinessDocsClient {

    private final RestClient restClient;
    private final String internalKey;

    public BusinessDocsClient(
            @Value("${service.business.url:http://localhost:8085}") String businessUrl,
            @Value("${business.internal.key:${AUDIT_INGEST_KEY:dev-internal-audit-key}}") String internalKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(15000); // documents can be large
        this.restClient = RestClient.builder().baseUrl(businessUrl).requestFactory(factory).build();
        this.internalKey = internalKey;
    }

    /** Streams a business document's bytes + content type by its business-side id. */
    public Fetched fetch(String businessDocId) {
        try {
            ResponseEntity<byte[]> res = restClient.get()
                    .uri("/internal/business-documents/{id}/download", businessDocId)
                    .header("X-Internal-Key", internalKey)
                    .retrieve()
                    .toEntity(byte[].class);
            String ct = res.getHeaders().getFirst("Content-Type");
            return new Fetched(res.getBody(), ct);
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "could not retrieve the shared file from its source");
        }
    }

    public record Fetched(byte[] bytes, String contentType) {}
}
