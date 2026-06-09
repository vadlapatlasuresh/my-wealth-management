package com.mywealthmanagement.secretsservice.secret;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface SecretVersionRepository extends JpaRepository<SecretVersion, Long> {
    Optional<SecretVersion> findFirstBySecretIdAndStatusOrderByVersionDesc(Long secretId, String status);
    List<SecretVersion> findBySecretIdOrderByVersionDesc(Long secretId);
}
