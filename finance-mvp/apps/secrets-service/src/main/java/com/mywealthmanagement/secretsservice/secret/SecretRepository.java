package com.mywealthmanagement.secretsservice.secret;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SecretRepository extends JpaRepository<Secret, Long> {
    Optional<Secret> findByName(String name);
    List<Secret> findByScope(String scope);
    boolean existsByName(String name);
}
