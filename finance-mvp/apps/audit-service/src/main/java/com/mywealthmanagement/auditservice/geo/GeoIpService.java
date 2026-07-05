package com.mywealthmanagement.auditservice.geo;

import com.maxmind.geoip2.DatabaseReader;
import com.maxmind.geoip2.model.CityResponse;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.File;
import java.net.InetAddress;

/**
 * Offline geo-IP lookup using a local MaxMind GeoLite2-City database.
 *
 * <p>Fully optional and self-contained — no external API calls. It is disabled by
 * default and degrades gracefully: if {@code geoip.enabled=false}, the db path is
 * empty, the file is missing, or the IP can't be resolved (private/loopback/unknown),
 * {@link #resolve(String)} simply returns {@code null} and the login history shows the
 * raw IP instead. This mirrors the project's "config-flag gated + safe fallback"
 * convention for every integration.
 *
 * <p>To enable: create a free MaxMind account, download {@code GeoLite2-City.mmdb},
 * set {@code GEOIP_ENABLED=true} and {@code GEOIP_DB_PATH=/path/to/GeoLite2-City.mmdb}.
 */
@Service
public class GeoIpService {

    private static final Logger log = LoggerFactory.getLogger(GeoIpService.class);

    @Value("${geoip.enabled:false}")
    private boolean enabled;

    @Value("${geoip.db-path:}")
    private String dbPath;

    /** Thread-safe once built; MaxMind's DatabaseReader is safe for concurrent reads. */
    private volatile DatabaseReader reader;

    @PostConstruct
    void init() {
        if (!enabled) {
            log.info("GeoIP disabled (geoip.enabled=false); login history shows IP only.");
            return;
        }
        if (dbPath == null || dbPath.isBlank()) {
            log.warn("GeoIP enabled but geoip.db-path is empty; falling back to IP only.");
            return;
        }
        File db = new File(dbPath);
        if (!db.isFile()) {
            log.warn("GeoIP database not found at '{}'; falling back to IP only.", dbPath);
            return;
        }
        try {
            reader = new DatabaseReader.Builder(db).build();
            log.info("GeoIP database loaded from '{}'.", dbPath);
        } catch (Exception e) {
            log.warn("Failed to load GeoIP database at '{}': {}", dbPath, e.getMessage());
        }
    }

    /** Resolve an IP to a city/country. Returns {@code null} on any failure — never throws. */
    public GeoLocation resolve(String ip) {
        DatabaseReader r = reader;
        if (r == null || ip == null || ip.isBlank() || isPrivate(ip)) return null;
        try {
            CityResponse resp = r.city(InetAddress.getByName(ip));
            String city = resp.getCity() != null ? resp.getCity().getName() : null;
            String country = resp.getCountry() != null ? resp.getCountry().getName() : null;
            if (city == null && country == null) return null;
            return new GeoLocation(city, country);
        } catch (Exception e) {
            return null; // address-not-found / private / lookup failure → no location
        }
    }

    /** Loopback, link-local and RFC-1918 private ranges never have a public geo-location. */
    private static boolean isPrivate(String ip) {
        try {
            InetAddress addr = InetAddress.getByName(ip);
            return addr.isAnyLocalAddress() || addr.isLoopbackAddress()
                    || addr.isLinkLocalAddress() || addr.isSiteLocalAddress();
        } catch (Exception e) {
            return true;
        }
    }

    @PreDestroy
    void close() {
        try {
            if (reader != null) reader.close();
        } catch (Exception ignored) {
            // best-effort close on shutdown
        }
    }

    /** Resolved location; either field may be null. */
    public record GeoLocation(String city, String country) {}
}
