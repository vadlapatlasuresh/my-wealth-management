package com.mywealthmanagement.realestateservice.storage;

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
 * Stores uploaded property photos in Google Cloud Storage. Config-gated, lazy-init,
 * best-effort delete — same contract as documents-service's DocumentStorageService,
 * but objects live under a listing (per-deal) prefix.
 *
 * <p>Active only when {@code storage.provider=gcs} and {@code gcs.bucket} is set.
 * On the GCP VM the client authenticates via Application Default Credentials (the VM
 * service account), so no key file is needed. With storage disabled the service still
 * starts cleanly and listings work in every other respect — they just carry no photos.
 */
@Service
public class DealImageStorageService {

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
                    "Photo upload is not configured. Set STORAGE_PROVIDER=gcs and GCS_BUCKET "
                            + "to enable listing photos.");
        }
    }

    /** Uploads bytes and returns the stored object metadata. */
    public Stored upload(Long dealId, String filename, String contentType, byte[] bytes) {
        requireEnabled();
        String object = "deal-images/" + dealId + "/" + UUID.randomUUID() + "-" + sanitize(filename);
        String ct = (contentType == null || contentType.isBlank()) ? "application/octet-stream" : contentType;
        BlobInfo info = BlobInfo.newBuilder(BlobId.of(bucket, object)).setContentType(ct).build();
        storage().create(info, bytes);
        return new Stored(object, ct, bytes.length);
    }

    /** Streams a stored object back for the authenticated image endpoint. */
    public Download download(String objectName) {
        requireEnabled();
        Blob blob = storage().get(BlobId.of(bucket, objectName));
        if (blob == null || !blob.exists()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "photo not found in storage");
        }
        return new Download(blob.getContent(), blob.getContentType(), blob.getSize());
    }

    /** Best-effort delete; never throws (called when an image row is removed). */
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
        String base = (filename == null || filename.isBlank()) ? "photo" : filename;
        base = base.replaceAll("[\\\\/\\p{Cntrl}]", "_").trim();
        if (base.length() > 200) base = base.substring(base.length() - 200);
        return base.isBlank() ? "photo" : base;
    }

    public record Stored(String objectName, String contentType, long size) {}
    public record Download(byte[] bytes, String contentType, long size) {}
}
