package com.mywealthmanagement.financialcoreservice.invest;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BrokerAccountRepository extends JpaRepository<BrokerAccount, Long> {
    List<BrokerAccount> findByUserIdOrderByLinkedAtDesc(Long userId);

    Optional<BrokerAccount> findByIdAndUserId(Long id, Long userId);
}
