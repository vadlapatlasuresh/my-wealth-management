package com.mywealthmanagement.accountaggregationservice.holding;

import com.mywealthmanagement.accountaggregationservice.holding.dto.HoldingDto;
import com.mywealthmanagement.accountaggregationservice.holding.dto.InvestmentTransactionDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HoldingService {

    private final HoldingRepository holdingRepository;
    private final InvestmentTransactionRepository investmentTransactionRepository;

    public List<HoldingDto> getHoldingsByUserId(Long userId) {
        return holdingRepository.findByUserIdOrderByValueDesc(userId).stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    public List<InvestmentTransactionDto> getInvestmentTransactionsByUserId(Long userId) {
        return investmentTransactionRepository.findByUserIdOrderByDateDesc(userId).stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    private InvestmentTransactionDto toDto(InvestmentTransaction t) {
        return new InvestmentTransactionDto(
                t.getDate(),
                t.getName(),
                t.getSymbol(),
                t.getBroker(),
                t.getType(),
                t.getSubtype(),
                t.getQuantity(),
                t.getPrice(),
                t.getAmount(),
                t.getFees()
        );
    }

    private HoldingDto toDto(Holding h) {
        return new HoldingDto(
                h.getSymbol(),
                h.getName(),
                h.getBroker(),
                h.getQuantity(),
                h.getPrice(),
                h.getValue(),
                h.getCostBasis(),
                BigDecimal.ZERO
        );
    }
}
