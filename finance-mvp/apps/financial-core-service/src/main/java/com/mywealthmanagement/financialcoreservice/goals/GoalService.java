package com.mywealthmanagement.financialcoreservice.goals;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;

@Service
@RequiredArgsConstructor
public class GoalService {

    private final GoalRepository goalRepository;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    public List<GoalDto> list() {
        return goalRepository.findByUserIdOrderByCreatedAtAsc(userId())
                .stream().map(this::toDto).toList();
    }

    public GoalDto create(GoalDto dto) {
        Goal g = new Goal();
        g.setUserId(userId());
        apply(g, dto);
        return toDto(goalRepository.save(g));
    }

    public GoalDto update(Long id, GoalDto dto) {
        Goal g = goalRepository.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new IllegalArgumentException("Goal not found"));
        apply(g, dto);
        return toDto(goalRepository.save(g));
    }

    public void delete(Long id) {
        Goal g = goalRepository.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new IllegalArgumentException("Goal not found"));
        goalRepository.delete(g);
    }

    private void apply(Goal g, GoalDto dto) {
        if (dto.getName() != null) g.setName(dto.getName());
        String type = dto.getGoalType();
        g.setGoalType(type == null || type.isBlank() ? "SAVINGS" : type.toUpperCase());
        g.setTargetAmount(nz(dto.getTargetAmount()));
        g.setCurrentAmount(nz(dto.getCurrentAmount()));
        g.setTargetDate(dto.getTargetDate());
        g.setMonthlyContribution(dto.getMonthlyContribution());
        if (g.getName() == null || g.getName().isBlank()) g.setName("Untitled goal");
    }

    private GoalDto toDto(Goal g) {
        double progress = 0d;
        BigDecimal target = nz(g.getTargetAmount());
        if (target.signum() > 0) {
            progress = nz(g.getCurrentAmount())
                    .divide(target, 4, RoundingMode.HALF_UP)
                    .doubleValue();
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;
        }
        return new GoalDto(
                g.getId(), g.getName(), g.getGoalType(),
                g.getTargetAmount(), g.getCurrentAmount(),
                g.getTargetDate(), g.getMonthlyContribution(), progress);
    }
}
