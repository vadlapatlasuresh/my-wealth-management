package com.mywealthmanagement.realestateservice.holding;

import com.mywealthmanagement.realestateservice.common.Urls;
import com.mywealthmanagement.realestateservice.holding.dto.K1RecordDto;
import com.mywealthmanagement.realestateservice.holding.dto.K1YearSummaryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.MonthDay;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * Schedule K-1 tracking across the user's private holdings.
 *
 * <p>The problem this solves: a partnership issues K-1s long after year end, often past the
 * filing deadline, and one missing form stops the entire return. So the unit of value here is
 * not the form itself but the <em>gap</em> — which holdings still owe you a K-1 for a given
 * year, how overdue they are, and who to chase.
 *
 * <p>Expected records are generated rather than entered: if you hold units in an LLC for a
 * tax year, a K-1 is owed, and making the user create a placeholder for something they are
 * merely waiting on would defeat the purpose.
 */
@Service
@RequiredArgsConstructor
public class K1Service {

    /** Statuses a K-1 record can be in. */
    public static final String EXPECTED = "EXPECTED";
    public static final String RECEIVED = "RECEIVED";
    public static final String NOT_APPLICABLE = "NOT_APPLICABLE";
    public static final Set<String> STATUSES = Set.of(EXPECTED, RECEIVED, NOT_APPLICABLE);

    /**
     * The individual filing deadline. A K-1 still outstanding after this is what forces an
     * extension, so it is the line that makes a record "overdue" rather than merely pending.
     * Deliberately ignores weekend/holiday shifts and extensions — it is a nudge, not a
     * tax determination.
     */
    private static final MonthDay FILING_DEADLINE = MonthDay.of(4, 15);

    private final PrivateHoldingRepository holdingRepository;
    private final K1RecordRepository k1Repository;
    private final Clock clock;

    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /** Tax years the user could owe K-1s for: from their earliest holding to last year. */
    public List<Integer> availableYears() {
        List<PrivateHolding> holdings = holdingRepository.findByUserIdOrderByCreatedAtDesc(getUserId());
        int latest = LocalDate.now(clock).getYear() - 1;   // the most recent completed tax year
        int earliest = holdings.stream()
                .map(this::firstTaxYearFor)
                .min(Integer::compareTo)
                .orElse(latest);
        List<Integer> years = new ArrayList<>();
        for (int y = latest; y >= earliest; y--) {
            years.add(y);
        }
        return years.isEmpty() ? List.of(latest) : years;
    }

    /**
     * Filing readiness for a tax year, with the outstanding K-1s ready to chase.
     *
     * <p>Reconciles on read: every holding that was alive during the year gets a record, so a
     * holding added after the fact still shows up as owing a K-1 rather than being silently
     * missed.
     */
    public K1YearSummaryDto getYear(Integer taxYear) {
        return getYearForUser(getUserId(), taxYear);
    }

    /**
     * Same, for an explicit user. Split out because the weekly alert job runs with no
     * SecurityContext to read the caller from.
     */
    public K1YearSummaryDto getYearForUser(Long userId, Integer taxYear) {
        int year = taxYear != null ? taxYear : LocalDate.now(clock).getYear() - 1;

        Map<Long, PrivateHolding> holdings = holdingRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream().collect(Collectors.toMap(PrivateHolding::getId, h -> h));
        List<K1Record> stored = k1Repository.findByUserIdAndTaxYearOrderByIdAsc(userId, year);

        // Fill the gap: any holding that existed in this tax year and has no record yet.
        Set<Long> haveRecords = stored.stream().map(K1Record::getHoldingId).collect(Collectors.toSet());
        List<K1Record> created = new ArrayList<>();
        for (PrivateHolding h : holdings.values()) {
            if (!haveRecords.contains(h.getId()) && owesK1For(h, year)) {
                K1Record r = new K1Record();
                r.setHoldingId(h.getId());
                r.setUserId(userId);
                r.setTaxYear(year);
                r.setStatus(EXPECTED);
                created.add(r);
            }
        }
        if (!created.isEmpty()) {
            stored = new ArrayList<>(stored);
            stored.addAll(k1Repository.saveAll(created));
        }

        // Drop records whose holding has since been deleted.
        List<K1Record> live = stored.stream()
                .filter(r -> holdings.containsKey(r.getHoldingId()))
                .collect(Collectors.toList());

        boolean deadlinePassed = LocalDate.now(clock).isAfter(FILING_DEADLINE.atYear(year + 1));

        List<K1RecordDto> dtos = live.stream()
                .map(r -> toDto(r, holdings.get(r.getHoldingId()), deadlinePassed))
                .collect(Collectors.toList());

        K1YearSummaryDto summary = new K1YearSummaryDto();
        summary.setTaxYear(year);
        summary.setExpected((int) dtos.stream().filter(d -> EXPECTED.equals(d.getStatus())).count());
        summary.setReceived((int) dtos.stream().filter(d -> RECEIVED.equals(d.getStatus())).count());
        summary.setNotApplicable((int) dtos.stream().filter(d -> NOT_APPLICABLE.equals(d.getStatus())).count());
        summary.setOverdue((int) dtos.stream().filter(d -> Boolean.TRUE.equals(d.getOverdue())).count());
        // Nothing outstanding — including the case where the user has no holdings at all.
        summary.setReadyToFile(summary.getExpected() == 0);
        summary.setOrdinaryIncome(sumReceived(live, K1Record::getOrdinaryIncome));
        summary.setRentalIncome(sumReceived(live, K1Record::getRentalIncome));
        summary.setDistributions(sumReceived(live, K1Record::getDistributions));
        summary.setOutstanding(dtos.stream()
                .filter(d -> EXPECTED.equals(d.getStatus()))
                .collect(Collectors.toList()));
        return summary;
    }

    /** Every tracked K-1, newest tax year first. */
    public List<K1RecordDto> getAll() {
        Long userId = getUserId();
        Map<Long, PrivateHolding> holdings = holdingRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream().collect(Collectors.toMap(PrivateHolding::getId, h -> h));
        LocalDate today = LocalDate.now(clock);
        return k1Repository.findByUserIdOrderByTaxYearDescIdAsc(userId).stream()
                .filter(r -> holdings.containsKey(r.getHoldingId()))
                .map(r -> toDto(r, holdings.get(r.getHoldingId()),
                        today.isAfter(FILING_DEADLINE.atYear(r.getTaxYear() + 1))))
                .collect(Collectors.toList());
    }

    /** Update a K-1: mark it received, attach the document, transcribe the figures. */
    public K1RecordDto update(Long id, K1RecordDto dto) {
        Long userId = getUserId();
        K1Record record = k1Repository.findByIdAndUserId(id, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "K-1 not found"));

        String status = dto.getStatus() == null || dto.getStatus().isBlank()
                ? record.getStatus() : dto.getStatus().trim().toUpperCase();
        if (!STATUSES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status: " + dto.getStatus());
        }
        record.setStatus(status);

        if (RECEIVED.equals(status)) {
            // Marking one received without saying when is the common case — default to today
            // so the record is still useful, rather than rejecting it.
            record.setReceivedOn(dto.getReceivedOn() != null ? dto.getReceivedOn() : LocalDate.now(clock));
        } else {
            record.setReceivedOn(null);
        }

        record.setDocumentId(dto.getDocumentId());
        record.setDocumentName(dto.getDocumentName() == null || dto.getDocumentName().isBlank()
                ? null : dto.getDocumentName().trim());
        record.setDocumentUrl(Urls.validateOrNull(dto.getDocumentUrl(), "documentUrl"));
        record.setOrdinaryIncome(dto.getOrdinaryIncome());
        record.setRentalIncome(dto.getRentalIncome());
        record.setDistributions(dto.getDistributions());
        record.setNotes(dto.getNotes() == null || dto.getNotes().isBlank() ? null : dto.getNotes().trim());

        PrivateHolding holding = holdingRepository.findByIdAndUserId(record.getHoldingId(), userId).orElse(null);
        boolean deadlinePassed = LocalDate.now(clock).isAfter(FILING_DEADLINE.atYear(record.getTaxYear() + 1));
        return toDto(k1Repository.save(record), holding, deadlinePassed);
    }

    // ---- helpers ----

    /**
     * A holding owes a K-1 for a year if it existed during it. Uses the acquisition date when
     * the user gave one, else the year the record was created — a holding entered today for a
     * deal bought years ago should not silently claim K-1s for years it did not exist.
     */
    private boolean owesK1For(PrivateHolding h, int year) {
        return firstTaxYearFor(h) <= year;
    }

    private int firstTaxYearFor(PrivateHolding h) {
        if (h.getAcquiredOn() != null) {
            return h.getAcquiredOn().getYear();
        }
        return h.getCreatedAt() != null ? h.getCreatedAt().getYear() : LocalDate.now(clock).getYear();
    }

    private static BigDecimal sumReceived(List<K1Record> records,
                                          java.util.function.Function<K1Record, BigDecimal> f) {
        return records.stream()
                .filter(r -> RECEIVED.equals(r.getStatus()))
                .map(f).filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private K1RecordDto toDto(K1Record r, PrivateHolding holding, boolean deadlinePassed) {
        K1RecordDto dto = new K1RecordDto();
        dto.setId(r.getId());
        dto.setHoldingId(r.getHoldingId());
        dto.setTaxYear(r.getTaxYear());
        dto.setStatus(r.getStatus());
        dto.setReceivedOn(r.getReceivedOn());
        dto.setDocumentId(r.getDocumentId());
        dto.setDocumentName(r.getDocumentName());
        dto.setDocumentUrl(r.getDocumentUrl());
        dto.setOrdinaryIncome(r.getOrdinaryIncome());
        dto.setRentalIncome(r.getRentalIncome());
        dto.setDistributions(r.getDistributions());
        dto.setNotes(r.getNotes());
        if (holding != null) {
            dto.setHoldingName(holding.getName());
            dto.setSponsorName(holding.getSponsorName());
            dto.setSponsorContact(holding.getSponsorContact());
        }
        dto.setOverdue(EXPECTED.equals(r.getStatus()) && deadlinePassed);
        return dto;
    }

    /** Remove the K-1 history for a holding that is being deleted. */
    public void deleteForHolding(Long holdingId) {
        k1Repository.deleteByHoldingId(holdingId);
    }

    /** Statuses, for the UI dropdown. */
    public static Set<String> statuses() {
        return new HashSet<>(STATUSES);
    }
}
