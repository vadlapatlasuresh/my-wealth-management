package com.mywealthmanagement.documentsservice.storage;

import com.google.cloud.storage.Blob;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import com.google.cloud.storage.StorageOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.UUID;

/**
 * Stores uploaded personal documents in Google Cloud Storage. Config-gated,
 * lazy-init, best-effort delete — same contract as business-financials-service's
 * DocumentStorageService, but objects live under a personal (per-user) prefix.
 *
 * <p>Active only when {@code storage.provider=gcs} and {@code gcs.bucket} is set.
 * On the GCP VM the client authenticates via Application Default Credentials (the
 * VM service account), so no key file is needed. With storage disabled the service
 * still starts cleanly and link-based documents keep working.
 */
@Service
public class DocumentStorageService {

    @Value("${storage.provider:none}")
    private String provider;

    @Value("${gcs.bucket:}")
    private String bucket;

    private volatile Storage storage;

    /** True when uploads are configured (provider=gcs + a bucket). */
    public boolean isEnabled() {
        return "gcs".equalsIgnoreCase(provider) && bucket != null && !bucket.isBlank();
    }

    private Storage storage() {
        if (storage == null) {
            synchronized (this) {
                if (storage == null) {
                    storage = StorageOptions.getDefaultInstance().getService();
                }
            }
        }
        return storage;
    }

    private void requireEnabled() {
        if (!isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "File upload is not configured. Add a link instead, or set storage.provider=gcs + gcs.bucket.");
        }
    }

    /** Uploads bytes and returns the stored object metadata. */
    public Stored upload(Long userId, String filename, String contentType, byte[] bytes) {
        requireEnabled();
        String object = "personal/" + userId + "/" + UUID.randomUUID() + "-" + sanitize(filename);
        String ct = (contentType == null || contentType.isBlank()) ? "application/octet-stream" : contentType;
        BlobInfo info = BlobInfo.newBuilder(BlobId.of(bucket, object)).setContentType(ct).build();
        storage().create(info, bytes);
        return new Stored(object, ct, bytes.length);
    }

    /** Streams a stored object back (for the authenticated / token download endpoints). */
    public Download download(String objectName) {
        requireEnabled();
        Blob blob = storage().get(BlobId.of(bucket, objectName));
        if (blob == null || !blob.exists()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "file not found in storage");
        }
        return new Download(blob.getContent(), blob.getContentType(), blob.getSize());
    }

    /** Best-effort delete; never throws (called when a document row is removed). */
    public void delete(String objectName) {
        if (!isEnabled() || objectName == null || objectName.isBlank()) return;
        try {
            storage().delete(BlobId.of(bucket, objectName));
        } catch (Exception ignored) {
            // best-effort: a failed cleanup must not fail the row delete
        }
    }

    /** Strip path separators / control chars from the client filename. */
    private String sanitize(String filename) {
        String base = (filename == null || filename.isBlank()) ? "file" : filename;
        base = base.replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        if (base.length() > 200) base = base.substring(base.length() - 200);
        return base.isBlank() ? "file" : base;
    }

    public record Stored(String objectName, String contentType, long size) {}
    public record Download(byte[] bytes, String contentType, long size) {}
}
