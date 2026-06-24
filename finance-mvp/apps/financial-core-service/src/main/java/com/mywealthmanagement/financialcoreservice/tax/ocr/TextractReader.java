package com.mywealthmanagement.financialcoreservice.tax.ocr;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import software.amazon.awssdk.core.SdkBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.textract.TextractClient;
import software.amazon.awssdk.services.textract.model.AnalyzeDocumentRequest;
import software.amazon.awssdk.services.textract.model.AnalyzeDocumentResponse;
import software.amazon.awssdk.services.textract.model.Block;
import software.amazon.awssdk.services.textract.model.Document;
import software.amazon.awssdk.services.textract.model.FeatureType;
import software.amazon.awssdk.services.textract.model.Relationship;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Real OCR for tax documents via AWS Textract's FORMS analysis, which returns key/value pairs
 * (e.g. "Wages, tips, other compensation" → "84,200.00") regardless of the box's 2-D position —
 * so it reliably reads any W-2 / 1099 / 1098 layout, including photos and scans, where the
 * text-pattern parser can't.
 *
 * <p>Flag-gated: the Textract client is built <em>only</em> when {@code tax.ocr.provider=textract}
 * (and a region is set), so no AWS credentials are required in the default (mock) configuration.
 * Credentials come from the standard AWS SDK chain (env vars / IAM role). Any failure returns an
 * empty result so the caller degrades to the regex parser — extraction never hard-fails.
 */
@Component
public class TextractReader {

    private static final Logger log = LoggerFactory.getLogger(TextractReader.class);

    private final boolean enabled;
    private final String region;
    private volatile TextractClient client; // built lazily on first use

    public TextractReader(@Value("${tax.ocr.provider:mock}") String provider,
                          @Value("${tax.ocr.textract.region:${AWS_REGION:us-east-1}}") String region) {
        this.enabled = "textract".equalsIgnoreCase(provider == null ? "" : provider.trim());
        this.region = region;
    }

    public boolean isEnabled() {
        return enabled;
    }

    /**
     * Extract form key/value pairs from a document's bytes (PDF single-page, PNG, JPEG, TIFF).
     * Returns an empty map when Textract is disabled or the call fails (caller falls back to regex).
     */
    public Map<String, String> extractKeyValues(byte[] bytes) {
        if (!enabled || bytes == null || bytes.length == 0) {
            return Map.of();
        }
        try {
            AnalyzeDocumentResponse resp = client().analyzeDocument(AnalyzeDocumentRequest.builder()
                    .document(Document.builder().bytes(SdkBytes.fromByteArray(bytes)).build())
                    .featureTypes(FeatureType.FORMS)
                    .build());
            return keyValues(resp.blocks());
        } catch (Exception e) {
            log.warn("Textract analyzeDocument failed ({}); falling back to text parser", e.getMessage());
            return Map.of();
        }
    }

    private TextractClient client() {
        TextractClient c = client;
        if (c == null) {
            synchronized (this) {
                c = client;
                if (c == null) {
                    c = TextractClient.builder().region(Region.of(region)).build();
                    client = c;
                }
            }
        }
        return c;
    }

    /** Build a key→value map from Textract FORMS blocks (KEY_VALUE_SET / WORD relationships). */
    private Map<String, String> keyValues(java.util.List<Block> blocks) {
        Map<String, Block> byId = new LinkedHashMap<>();
        for (Block b : blocks) byId.put(b.id(), b);

        Map<String, String> out = new LinkedHashMap<>();
        for (Block b : blocks) {
            if (b.blockType() != null && "KEY_VALUE_SET".equals(b.blockTypeAsString())
                    && b.entityTypes() != null && b.entityTypes().stream().anyMatch(t -> "KEY".equals(t.toString()))) {
                String key = textOf(b, byId);
                Block valueBlock = relatedBlock(b, "VALUE", byId);
                String value = valueBlock == null ? "" : textOf(valueBlock, byId);
                if (!key.isBlank() && !value.isBlank()) {
                    out.put(key.trim(), value.trim());
                }
            }
        }
        return out;
    }

    /** The child-WORD text of a block (the human-readable key or value string). */
    private String textOf(Block block, Map<String, Block> byId) {
        if (block.relationships() == null) return "";
        StringBuilder sb = new StringBuilder();
        for (Relationship rel : block.relationships()) {
            if (!"CHILD".equals(rel.typeAsString())) continue;
            for (String childId : rel.ids()) {
                Block child = byId.get(childId);
                if (child != null && "WORD".equals(child.blockTypeAsString()) && child.text() != null) {
                    sb.append(child.text()).append(' ');
                }
            }
        }
        return sb.toString().trim();
    }

    private Block relatedBlock(Block block, String type, Map<String, Block> byId) {
        if (block.relationships() == null) return null;
        for (Relationship rel : block.relationships()) {
            if (type.equals(rel.typeAsString()) && !rel.ids().isEmpty()) {
                return byId.get(rel.ids().get(0));
            }
        }
        return null;
    }
}
