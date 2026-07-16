package com.mywealthmanagement.notificationservice.config;

/**
 * The ops/member token boundary for this service. Mirrors auth-service's
 * {@code com.mywealthmanagement.authservice.ops.OpsTokens} — duplicated per service because the
 * platform has no shared Java module (the same reason JwtService and JwtAuthFilter are
 * duplicated). The TYPE_* constants MUST stay identical across services.
 *
 * WHY THIS EXISTS: the JWT signing secret is shared platform-wide, so any validly-signed token is
 * accepted everywhere by default. Without this discriminator an ops-staff token would silently
 * pass as the customer whose id it carries. Member tokens predate the claim and carry no
 * {@code typ}, so ABSENT means MEMBER.
 */
public final class OpsTokens {

    private OpsTokens() {}

    /** JWT claim carrying the token type. Must match auth-service. */
    public static final String TYPE_CLAIM = "typ";

    /** Identifies an ops-staff token. Absent claim = member token. Must match auth-service. */
    public static final String TYPE_OPS = "ops";

    /**
     * EMPTY: this service has no ops surface, so an ops token is refused on every route here.
     * Adding an ops-facing route means adding its prefix here — otherwise it will 403 for ops.
     *
     * Note the ops MFA code path is unaffected: auth-service calls /internal/comms/otp
     * server-to-server with X-Internal-Key, which never involves a JWT.
     */
    public static final String[] OPS_PATH_PREFIXES = {};

    /** True if the request path belongs to this service's ops surface. */
    public static boolean isOpsPath(String path) {
        if (path == null) return false;
        for (String prefix : OPS_PATH_PREFIXES) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }
}
