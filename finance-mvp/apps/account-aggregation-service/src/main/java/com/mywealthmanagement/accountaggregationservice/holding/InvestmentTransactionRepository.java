package com.mywealthmanagement.accountaggregationservice.holding;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InvestmentTransactionRepository extends JpaRepository<InvestmentTransaction, Long> {

    List<InvestmentTransaction> findByUserIdOrderByDateDesc(Long userId);

    Optional<InvestmentTransaction> findByPlaidInvestmentTxnId(String plaidInvestmentTxnId);
}
