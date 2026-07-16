package com.mywealthmanagement.authservice.auth;

import com.mywealthmanagement.authservice.ops.OpsTokens;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String SECRET_KEY;

    @Value("${jwt.expiration}")
    private long EXPIRATION_TIME; // in milliseconds

    @Value("${ops.jwt.expiration:3600000}")
    private long OPS_EXPIRATION_TIME; // ops sessions are short-lived by design (default 60 min)

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    /**
     * Token type: {@link OpsTokens#TYPE_OPS} for ops-staff tokens, null for member tokens.
     * Member tokens predate the claim, so absent == member.
     */
    public String extractTokenType(String token) {
        Object raw = extractClaim(token, c -> c.get(OpsTokens.TYPE_CLAIM));
        return raw == null ? null : String.valueOf(raw);
    }

    /** True if this token was minted for an internal ops user rather than a customer. */
    public boolean isOpsToken(String token) {
        try {
            return OpsTokens.TYPE_OPS.equals(extractTokenType(token));
        } catch (Exception e) {
            return false; // unparseable → not an ops token; the validity check will reject it anyway
        }
    }

    /** Roles carried in the JWT (e.g. ["USER","CARE"]); empty if none/invalid. */
    @SuppressWarnings("unchecked")
    public List<String> extractRoles(String token) {
        Object raw = extractClaim(token, c -> c.get("roles"));
        if (raw instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return Collections.emptyList();
    }

    /** True if the token parses and is not expired (no UserDetails lookup needed). */
    public boolean isTokenValid(String token) {
        try {
            return !isTokenExpired(token);
        } catch (Exception e) {
            return false;
        }
    }

    public Date extractExpiration(String token) {
        return extractClaim(token, Claims::getExpiration);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        final Claims claims = extractAllClaims(token);
        return claimsResolver.apply(claims);
    }

    private Claims extractAllClaims(String token) {
        return Jwts
                .parserBuilder()
                .setSigningKey(getSignKey())
                .build()
                .parseClaimsJws(token)
                .getBody();
    }

    private Boolean isTokenExpired(String token) {
        return extractExpiration(token).before(new Date());
    }

    public Boolean validateToken(String token, UserDetails userDetails) {
        final String username = extractUsername(token);
        return (username.equals(userDetails.getUsername()) && !isTokenExpired(token));
    }

    public String generateToken(String userName) {
        return generateToken(userName, Collections.emptyList());
    }

    public String generateToken(String userName, List<String> roles) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("roles", roles);
        return createToken(claims, userName, EXPIRATION_TIME);
    }

    /**
     * Mint a token for an internal ops user. The subject is the ops_users id — which lives in a
     * different table from customer ids, so an ops token's subject is meaningless to member
     * routes even if the typ guard were somehow bypassed.
     *
     * Carries both `roles` (for display) and `perms` — the resolved permission keys that
     * @PreAuthorize actually checks. Ops tokens expire faster than member tokens because
     * authority is resolved at login: a revoked permission stays live until expiry, and the
     * short TTL is what bounds that window.
     */
    public String generateOpsToken(String opsUserId, List<String> roles, Collection<String> perms) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("roles", roles);
        claims.put("perms", List.copyOf(perms));
        claims.put(OpsTokens.TYPE_CLAIM, OpsTokens.TYPE_OPS);
        return createToken(claims, opsUserId, OPS_EXPIRATION_TIME);
    }

    /** Permission keys from the JWT `perms` claim (ops tokens only); empty for member tokens. */
    public List<String> extractPermissions(String token) {
        Object raw = extractClaim(token, c -> c.get("perms"));
        if (raw instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return Collections.emptyList();
    }

    private String createToken(Map<String, Object> claims, String userName, long ttlMillis) {
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(userName)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + ttlMillis))
                .signWith(getSignKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    private Key getSignKey() {
        return Keys.hmacShaKeyFor(SECRET_KEY.getBytes(StandardCharsets.UTF_8));
    }
}
