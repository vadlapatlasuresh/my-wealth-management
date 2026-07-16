package com.mywealthmanagement.auditservice.config;

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
     * Paths on THIS service that ops tokens — and only ops tokens — may authenticate against:
     * operator analytics and the system health/alert feed.
     *
     * Deliberately narrow. The rest of /api/v1/audit/** is either internal-key guarded
     * (event ingest) or member-facing (/me, a customer reading their own activity) — and
     * /me must keep working for MEMBER tokens, so it must NOT appear here.
     */
    public static final String[] OPS_PATH_PREFIXES = {"/api/v1/audit/stats", "/api/v1/audit/health/"};

    /** True if the request path belongs to this service's ops surface. */
    public static boolean isOpsPath(String path) {
        if (path == null) return false;
        for (String prefix : OPS_PATH_PREFIXES) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }
}
