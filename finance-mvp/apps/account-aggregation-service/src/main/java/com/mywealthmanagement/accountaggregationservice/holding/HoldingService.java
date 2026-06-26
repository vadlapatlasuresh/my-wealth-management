package com.mywealthmanagement.accountaggregationservice.holding;

import com.mywealthmanagement.accountaggregationservice.holding.dto.HoldingDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class HoldingService {

    private final HoldingRepository holdingRepository;

    public List<HoldingDto> getHoldingsByUserId(Long userId) {
        return holdingRepository.findByUserIdOrderByValueDesc(userId).stream()
                .map(this::toDto)
                .collect(Collectors.toList());
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
