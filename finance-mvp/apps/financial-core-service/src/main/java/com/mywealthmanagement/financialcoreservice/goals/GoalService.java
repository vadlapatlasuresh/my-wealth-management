package com.mywealthmanagement.financialcoreservice.goals;

import com.mywealthmanagement.financialcoreservice.clients.AccountAggregationClient;
import com.mywealthmanagement.financialcoreservice.clients.RealEstateClient;
import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.PropertyDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class GoalService {

    static final String MODE_MANUAL = "MANUAL";
    static final String MODE_BALANCE = "BALANCE";
    static final String MODE_CONTRIBUTIONS = "CONTRIBUTIONS";
    static final String TYPE_DEBT_PAYOFF = "DEBT_PAYOFF";
    private static final Set<String> MODES = Set.of(MODE_MANUAL, MODE_BALANCE, MODE_CONTRIBUTIONS);

    private final GoalRepository goalRepository;
    private final GoalAccountLinkRepository linkRepository;
    private final GoalContributionRepository contributionRepository;
    private final AccountAggregationClient accountAggregationClient;
    private final RealEstateClient realEstateClient;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    private String authHeader() {
        Object credentials = SecurityContextHolder.getContext().getAuthentication().getCredentials();
        String token = credentials != null ? credentials.toString() : "";
        return token.startsWith("Bearer ") ? token : "Bearer " + token;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }

    private static boolean isPayoff(Goal g) {
        return TYPE_DEBT_PAYOFF.equalsIgnoreCase(g.getGoalType())
                && (g.getPropertyId() != null || g.getLoanAccountId() != null);
    }

    // ---- CRUD ----

    public List<GoalDto> list() {
        Long uid = userId();
        List<Goal> goals = goalRepository.findByUserIdOrderByCreatedAtAsc(uid);
        Map<Long, AccountDto> accounts = fetchAccounts();
        Map<Long, PropertyDto> properties = goals.stream().anyMatch(g -> g.getPropertyId() != null)
                ? fetchProperties() : Map.of();
        return goals.stream().map(g -> toDto(g, accounts, properties)).toList();
    }

    @Transactional
    public GoalDto create(GoalDto dto) {
        Goal g = new Goal();
        g.setUserId(userId());
        apply(g, dto);
        g = goalRepository.save(g);
        Map<Long, AccountDto> accounts = fetchAccounts();
        Map<Long, PropertyDto> properties = g.getPropertyId() != null ? fetchProperties() : Map.of();
        if (dto.getAccountIds() != null) {
            for (Long accountId : dto.getAccountIds()) {
                if (accountId != null) linkInternal(g, accountId, accounts);
            }
        }
        resolvePayoffBaseline(g, accounts, properties);
        return toDto(g, accounts, properties);
    }

    @Transactional
    public GoalDto update(Long id, GoalDto dto) {
        Goal g = requireGoal(id);
        apply(g, dto);
        Map<Long, AccountDto> accounts = fetchAccounts();
        Map<Long, PropertyDto> properties = g.getPropertyId() != null ? fetchProperties() : Map.of();
        resolvePayoffBaseline(g, accounts, properties);
        return toDto(goalRepository.save(g), accounts, properties);
    }

    @Transactional
    public void delete(Long id) {
        Goal g = requireGoal(id);
        linkRepository.deleteByGoalId(g.getId());
        contributionRepository.deleteByGoalId(g.getId());
        goalRepository.delete(g);
    }

    // ---- Account links ----

    @Transactional
    public GoalDto linkAccount(Long goalId, Long accountId) {
        Goal g = requireGoal(goalId);
        Map<Long, AccountDto> accounts = fetchAccounts();
        linkInternal(g, accountId, accounts);
        // Linking with no explicit mode yet? Default a linked goal to BALANCE tracking.
        if (MODE_MANUAL.equals(g.getTrackingMode())) {
            g.setTrackingMode(MODE_BALANCE);
            goalRepository.save(g);
        }
        return toDto(g, accounts, Map.of());
    }

    /**
     * Unlink an account. In an auto mode we fold the account's current contribution into the goal's
     * manual base (as a ledger entry) so progress doesn't silently drop when the link is removed.
     */
    @Transactional
    public GoalDto unlinkAccount(Long goalId, Long accountId) {
        Goal g = requireGoal(goalId);
        GoalAccountLink link = linkRepository
                .findByGoalIdAndAccountIdAndUserId(goalId, accountId, g.getUserId())
                .orElseThrow(() -> new IllegalArgumentException("Link not found"));

        if (!MODE_MANUAL.equals(g.getTrackingMode())) {
            BigDecimal contributed = contributionOf(g, link, fetchAccounts().get(accountId));
            if (contributed.signum() > 0) {
                g.setCurrentAmount(nz(g.getCurrentAmount()).add(contributed));
                recordContribution(g, contributed,
                        "Kept from unlinked account " + (link.getAccountName() == null ? accountId : link.getAccountName()));
                goalRepository.save(g);
            }
        }
        linkRepository.delete(link);
        return toDto(g, fetchAccounts(), Map.of());
    }

    private void linkInternal(Goal g, Long accountId, Map<Long, AccountDto> accounts) {
        if (linkRepository.existsByGoalIdAndAccountIdAndUserId(g.getId(), accountId, g.getUserId())) {
            return; // idempotent
        }
        GoalAccountLink link = new GoalAccountLink();
        link.setGoalId(g.getId());
        link.setUserId(g.getUserId());
        link.setAccountId(accountId);
        AccountDto a = accounts.get(accountId);
        if (a != null) {
            link.setAccountName(a.getOfficialName() != null ? a.getOfficialName() : a.getName());
            link.setBaselineAmount(nz(a.getCurrentBalance()));
            link.setLastBalance(nz(a.getCurrentBalance()));
            link.setCurrency(a.getCurrency());
        }
        linkRepository.save(link);
    }

    // ---- Manual contribution ledger ----

    @Transactional
    public GoalDto addContribution(Long goalId, GoalContributionDto dto) {
        Goal g = requireGoal(goalId);
        BigDecimal amount = nz(dto.getAmount());
        recordContribution(g, amount, dto.getNote());
        // Keep the stored manual base authoritative; floor at zero.
        BigDecimal next = nz(g.getCurrentAmount()).add(amount);
        g.setCurrentAmount(next.signum() < 0 ? BigDecimal.ZERO : next);
        goalRepository.save(g);
        return toDto(g, fetchAccounts(), Map.of());
    }

    public List<GoalContributionDto> contributions(Long goalId) {
        requireGoal(goalId); // ownership check
        return contributionRepository.findByGoalIdAndUserIdOrderByCreatedAtDesc(goalId, userId())
                .stream()
                .map(c -> new GoalContributionDto(c.getId(), c.getAmount(), c.getNote(), c.getCreatedAt()))
                .toList();
    }

    private void recordContribution(Goal g, BigDecimal amount, String note) {
        GoalContribution c = new GoalContribution();
        c.setGoalId(g.getId());
        c.setUserId(g.getUserId());
        c.setAmount(amount);
        c.setNote(note);
        contributionRepository.save(c);
    }

    // ---- Helpers ----

    private Goal requireGoal(Long id) {
        return goalRepository.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new IllegalArgumentException("Goal not found"));
    }

    private void apply(Goal g, GoalDto dto) {
        if (dto.getName() != null) g.setName(dto.getName());
        String type = dto.getGoalType();
        g.setGoalType(type == null || type.isBlank() ? "SAVINGS" : type.toUpperCase());
        String mode = dto.getTrackingMode();
        if (mode != null && !mode.isBlank()) {
            mode = mode.toUpperCase();
            g.setTrackingMode(MODES.contains(mode) ? mode : MODE_MANUAL);
        }
        if (dto.getCurrency() != null) g.setCurrency(dto.getCurrency().isBlank() ? null : dto.getCurrency().toUpperCase());
        g.setTargetAmount(nz(dto.getTargetAmount()));
        if (dto.getCurrentAmount() != null) g.setCurrentAmount(nz(dto.getCurrentAmount()));
        g.setTargetDate(dto.getTargetDate());
        g.setMonthlyContribution(dto.getMonthlyContribution());
        // Debt-payoff (mortgage) fields.
        g.setPropertyId(dto.getPropertyId());
        g.setLoanAccountId(dto.getLoanAccountId());
        if (dto.getMortgageApr() != null) g.setMortgageApr(dto.getMortgageApr());
        if (dto.getMonthlyPayment() != null) g.setMonthlyPayment(dto.getMonthlyPayment());
        if (dto.getExtraPayment() != null) g.setExtraPayment(dto.getExtraPayment());
        if (g.getName() == null || g.getName().isBlank()) g.setName("Untitled goal");
    }

    /**
     * Capture the payoff baseline (balance owed at goal start) and auto-fill APR/payment from a
     * property the first time a payoff goal is pointed at a source. Idempotent: once set, left alone.
     */
    private void resolvePayoffBaseline(Goal g, Map<Long, AccountDto> accounts, Map<Long, PropertyDto> properties) {
        if (!TYPE_DEBT_PAYOFF.equalsIgnoreCase(g.getGoalType())) return;
        boolean changed = false;
        if (g.getPropertyId() != null) {
            PropertyDto p = properties.get(g.getPropertyId());
            if (p != null) {
                if (g.getStartingBalance() == null) { g.setStartingBalance(nz(p.getMortgageBalance())); changed = true; }
                if (g.getMortgageApr() == null && p.getApr() != null) { g.setMortgageApr(p.getApr()); changed = true; }
                if (g.getMonthlyPayment() == null && p.getMonthlyPayment() != null) { g.setMonthlyPayment(p.getMonthlyPayment()); changed = true; }
            }
        } else if (g.getLoanAccountId() != null) {
            AccountDto a = accounts.get(g.getLoanAccountId());
            if (a != null && g.getStartingBalance() == null) { g.setStartingBalance(nz(a.getCurrentBalance())); changed = true; }
        }
        // The amount to pay off IS the starting balance — mirror it into the goal's target.
        if (g.getStartingBalance() != null && nz(g.getTargetAmount()).signum() == 0) {
            g.setTargetAmount(g.getStartingBalance()); changed = true;
        }
        if (changed) goalRepository.save(g);
    }

    /** Live account balances keyed by id; empty (not an error) when aggregation is unreachable. */
    private Map<Long, AccountDto> fetchAccounts() {
        try {
            List<AccountDto> accounts = accountAggregationClient.getAccounts(authHeader());
            if (accounts == null) return Map.of();
            return accounts.stream()
                    .filter(a -> a.getId() != null)
                    .collect(Collectors.toMap(AccountDto::getId, Function.identity(), (a, b) -> a));
        } catch (Exception e) {
            log.debug("Could not fetch accounts for goal tracking: {}", e.getMessage());
            return Map.of();
        }
    }

    /** Live properties keyed by id; empty (not an error) when real-estate is unreachable. */
    private Map<Long, PropertyDto> fetchProperties() {
        try {
            List<PropertyDto> properties = realEstateClient.getProperties(authHeader());
            if (properties == null) return Map.of();
            return properties.stream()
                    .filter(p -> p.getId() != null)
                    .collect(Collectors.toMap(PropertyDto::getId, Function.identity(), (a, b) -> a));
        } catch (Exception e) {
            log.debug("Could not fetch properties for payoff goals: {}", e.getMessage());
            return Map.of();
        }
    }

    /**
     * What a single linked account contributes toward its goal, honouring the tracking mode,
     * currency match, and a persisted last-known balance when the live balance is unavailable.
     */
    private BigDecimal contributionOf(Goal g, GoalAccountLink link, AccountDto live) {
        if (MODE_MANUAL.equals(g.getTrackingMode())) return BigDecimal.ZERO;

        // Skip accounts whose currency differs from the goal's chosen currency (can't add them safely).
        String linkCcy = live != null ? live.getCurrency() : link.getCurrency();
        if (g.getCurrency() != null && linkCcy != null && !g.getCurrency().equalsIgnoreCase(linkCcy)) {
            return BigDecimal.ZERO;
        }

        BigDecimal balance = live != null && live.getCurrentBalance() != null
                ? live.getCurrentBalance()
                : nz(link.getLastBalance());

        if (MODE_CONTRIBUTIONS.equals(g.getTrackingMode())) {
            BigDecimal delta = balance.subtract(nz(link.getBaselineAmount()));
            return delta.signum() < 0 ? BigDecimal.ZERO : delta;
        }
        // BALANCE
        return balance.signum() < 0 ? BigDecimal.ZERO : balance;
    }

    GoalDto toDto(Goal g, Map<Long, AccountDto> accounts, Map<Long, PropertyDto> properties) {
        GoalDto dto = new GoalDto();
        dto.setId(g.getId());
        dto.setName(g.getName());
        dto.setGoalType(g.getGoalType());
        dto.setTrackingMode(g.getTrackingMode());
        dto.setCurrency(g.getCurrency());
        dto.setTargetAmount(g.getTargetAmount());
        dto.setCurrentAmount(g.getCurrentAmount());
        dto.setTargetDate(g.getTargetDate());
        dto.setMonthlyContribution(g.getMonthlyContribution());
        dto.setPropertyId(g.getPropertyId());
        dto.setLoanAccountId(g.getLoanAccountId());
        dto.setMortgageApr(g.getMortgageApr());
        dto.setMonthlyPayment(g.getMonthlyPayment());
        dto.setExtraPayment(g.getExtraPayment());

        if (isPayoff(g)) {
            fillPayoff(g, dto, accounts, properties);
        } else {
            fillSavings(g, dto, accounts);
        }
        return dto;
    }

    /** DEBT_PAYOFF: progress is how much of the mortgage has been paid down since the goal started. */
    private void fillPayoff(Goal g, GoalDto dto, Map<Long, AccountDto> accounts, Map<Long, PropertyDto> properties) {
        BigDecimal starting = nz(g.getStartingBalance());
        BigDecimal current;
        boolean stale;
        if (g.getPropertyId() != null) {
            PropertyDto p = properties.get(g.getPropertyId());
            stale = p == null;
            current = p != null && p.getMortgageBalance() != null ? p.getMortgageBalance() : starting;
            dto.setPayoffSource("PROPERTY");
            dto.setPayoffLabel(p != null && p.getAddress() != null ? p.getAddress() : "Property mortgage");
            if (p != null) {
                if (dto.getMortgageApr() == null && p.getApr() != null) dto.setMortgageApr(p.getApr());
                if (dto.getMonthlyPayment() == null && p.getMonthlyPayment() != null) dto.setMonthlyPayment(p.getMonthlyPayment());
            }
        } else {
            AccountDto a = accounts.get(g.getLoanAccountId());
            stale = a == null;
            current = a != null && a.getCurrentBalance() != null ? a.getCurrentBalance() : starting;
            dto.setPayoffSource("ACCOUNT");
            dto.setPayoffLabel(a != null ? (a.getOfficialName() != null ? a.getOfficialName() : a.getName()) : "Loan account");
        }

        BigDecimal paidOff = starting.subtract(nz(current));
        if (paidOff.signum() < 0) paidOff = BigDecimal.ZERO;

        double progress = 0d;
        if (starting.signum() > 0) {
            progress = paidOff.divide(starting, 4, RoundingMode.HALF_UP).doubleValue();
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;
        }

        dto.setStartingBalance(starting);
        dto.setCurrentBalance(current);
        dto.setPaidOff(paidOff);
        dto.setPayoffStale(stale);
        dto.setSavedAmount(paidOff);
        dto.setLinkedBalance(BigDecimal.ZERO);
        dto.setProgress(progress);
        dto.setCurrencyMismatch(false);
        dto.setLinkedAccounts(List.of());
        // The amount to pay off is the starting balance — surface it as the target for display.
        if (nz(dto.getTargetAmount()).signum() == 0) dto.setTargetAmount(starting);
    }

    /** SAVINGS/NET_WORTH/etc.: saved = manual base + auto-tracked linked-account balances. */
    private void fillSavings(Goal g, GoalDto dto, Map<Long, AccountDto> accounts) {
        List<GoalAccountLink> links = linkRepository.findByGoalIdAndUserId(g.getId(), g.getUserId());

        BigDecimal auto = BigDecimal.ZERO;
        boolean anyMismatch = false;
        boolean dirty = false;
        List<GoalLinkDto> linkDtos = new ArrayList<>();

        for (GoalAccountLink link : links) {
            AccountDto live = accounts.get(link.getAccountId());
            boolean stale = live == null;
            if (live != null) {
                if (!Objects.equals(link.getLastBalance(), live.getCurrentBalance())) {
                    link.setLastBalance(live.getCurrentBalance());
                    dirty = true;
                }
                if (live.getCurrency() != null && !Objects.equals(link.getCurrency(), live.getCurrency())) {
                    link.setCurrency(live.getCurrency());
                    dirty = true;
                }
            }
            String linkCcy = live != null ? live.getCurrency() : link.getCurrency();
            boolean mismatch = g.getCurrency() != null && linkCcy != null
                    && !g.getCurrency().equalsIgnoreCase(linkCcy);
            anyMismatch = anyMismatch || mismatch;

            BigDecimal contributes = contributionOf(g, link, live);
            auto = auto.add(contributes);

            BigDecimal balance = live != null ? live.getCurrentBalance() : link.getLastBalance();
            linkDtos.add(new GoalLinkDto(
                    link.getAccountId(),
                    live != null ? (live.getOfficialName() != null ? live.getOfficialName() : live.getName()) : link.getAccountName(),
                    linkCcy, balance, link.getBaselineAmount(), contributes, stale, mismatch));
            if (dirty) {
                linkRepository.save(link);
                dirty = false;
            }
        }

        BigDecimal manual = nz(g.getCurrentAmount());
        BigDecimal saved = manual.add(auto);

        double progress = 0d;
        BigDecimal target = nz(g.getTargetAmount());
        if (target.signum() > 0) {
            progress = saved.divide(target, 4, RoundingMode.HALF_UP).doubleValue();
            if (progress < 0) progress = 0;
            if (progress > 1) progress = 1;
        }

        dto.setSavedAmount(saved);
        dto.setLinkedBalance(auto);
        dto.setProgress(progress);
        dto.setCurrencyMismatch(anyMismatch);
        dto.setLinkedAccounts(linkDtos);
    }
}
