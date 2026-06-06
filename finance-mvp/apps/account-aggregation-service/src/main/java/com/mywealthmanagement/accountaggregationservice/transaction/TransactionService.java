package com.mywealthmanagement.accountaggregationservice.transaction;

import com.mywealthmanagement.accountaggregationservice.transaction.dto.TransactionDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class TransactionService {

    private final TransactionRepository transactionRepository;

    public List<TransactionDto> getTransactionsByUserId(Long userId) {
        return transactionRepository.findByUserId(userId).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    private TransactionDto convertToDto(Transaction transaction) {
        return new TransactionDto(
                transaction.getId(),
                transaction.getAccountId(),
                transaction.getPlaidTransactionId(),
                transaction.getPlaidAccountId(),
                transaction.getName(),
                transaction.getAmount(),
                transaction.getIsoCurrencyCode(),
                transaction.getDate(),
                transaction.getCategory()
        );
    }
}
