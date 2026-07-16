package com.mywealthmanagement.financialcoreservice.config;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;
import java.util.function.Function;

@Service
public class JwtService {

    @Value("${jwt.secret}")
    private String SECRET_KEY;

    @Value("${jwt.expiration}")
    private long EXPIRATION_TIME; // in milliseconds

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    /** Roles from the token's {@code roles} claim (e.g. ["USER","ADMIN"]); empty if absent. */
    public java.util.List<String> extractRoles(String token) {
        Object raw = extractClaim(token, c -> c.get("roles"));
        if (raw instanceof java.util.List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return java.util.Collections.emptyList();
    }

    /**
     * Permission keys from the JWT `perms` claim (ops tokens only); empty for member tokens.
     * These are what authorises an ops action — a role name says who someone is, a permission
     * says what they may do, and only the latter is checked.
     */
    public java.util.List<String> extractPermissions(String token) {
        Object perms = extractClaim(token, c -> c.get("perms"));
        if (perms instanceof java.util.List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        return java.util.List.of();
    }

    /**
     * True if this token was minted for an internal ops user rather than a customer.
     * See {@link OpsTokens} for why this check exists on every service.
     */
    public boolean isOpsToken(String token) {
        try {
            return OpsTokens.TYPE_OPS.equals(extractClaim(token, c -> c.get(OpsTokens.TYPE_CLAIM)));
        } catch (Exception e) {
            return false; // unparseable → not an ops token; validity is checked separately
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
        Map<String, Object> claims = new HashMap<>();
        return createToken(claims, userName);
    }

    private String createToken(Map<String, Object> claims, String userName) {
        return Jwts.builder()
                .setClaims(claims)
                .setSubject(userName)
                .setIssuedAt(new Date(System.currentTimeMillis()))
                .setExpiration(new Date(System.currentTimeMillis() + EXPIRATION_TIME))
                .signWith(getSignKey(), SignatureAlgorithm.HS256)
                .compact();
    }

    private Key getSignKey() {
        return Keys.hmacShaKeyFor(SECRET_KEY.getBytes(StandardCharsets.UTF_8));
    }
}
