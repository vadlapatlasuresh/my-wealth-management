package com.mywealthmanagement.authservice.ops;

/**
 * The contract that keeps ops and member identities apart at the token layer.
 *
 * WHY THIS EXISTS: the JWT signing secret is shared by every service on the platform, so any
 * validly-signed token is, by default, accepted everywhere. Without a discriminator claim an ops
 * token would silently pass every member endpoint's JwtAuthFilter, and "separate ops login" would
 * be decoration. The {@code typ} claim is that discriminator, and it only works because EVERY
 * service checks it — see the matching {@code isOpsToken} guard in each service's JwtAuthFilter.
 *
 * Member tokens predate this claim and carry no {@code typ}, so ABSENT means MEMBER. That keeps
 * already-issued member tokens valid across the deploy, and means a forged "typeless" token gains
 * nothing: it is still just a member token, and member tokens are refused on every ops route.
 */
public final class OpsTokens {

    private OpsTokens() {}

    /** JWT claim name carrying the token type. */
    public static final String TYPE_CLAIM = "typ";

    /** Value of {@link #TYPE_CLAIM} identifying an ops-staff token. Absent claim = member token. */
    public static final String TYPE_OPS = "ops";

    /**
     * Path prefixes that ops tokens — and ONLY ops tokens — may authenticate against.
     * {@code /api/v1/support/**} is included because it is the existing customer-care surface,
     * which moves to ops-only identity as of this change.
     */
    public static final String[] OPS_PATH_PREFIXES = {"/api/v1/ops/", "/api/v1/support/"};

    /** True if the request path belongs to the ops surface. */
    public static boolean isOpsPath(String path) {
        if (path == null) return false;
        for (String prefix : OPS_PATH_PREFIXES) {
            if (path.startsWith(prefix)) return true;
        }
        return false;
    }
}
