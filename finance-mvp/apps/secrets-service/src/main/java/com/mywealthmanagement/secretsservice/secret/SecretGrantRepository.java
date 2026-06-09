package com.mywealthmanagement.secretsservice.secret;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SecretGrantRepository extends JpaRepository<SecretGrant, Long> {
    boolean existsByPrincipalAndScopeAndPermission(String principal, String scope, String permission);
}
