package com.mywealthmanagement.realestateservice.holding;

import com.mywealthmanagement.realestateservice.common.Urls;
import com.mywealthmanagement.realestateservice.deal.Deal;
import com.mywealthmanagement.realestateservice.deal.DealRepository;
import com.mywealthmanagement.realestateservice.holding.dto.HoldingEntryDto;
import com.mywealthmanagement.realestateservice.holding.dto.HoldingSummaryDto;
import com.mywealthmanagement.realestateservice.holding.dto.PrivateHoldingDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * The user's private co-ownership positions and their capital accounts.
 *
 * <p>This is a ledger of interests the user <em>already owns</em>, bought directly from a
 * sponsor off this platform. TerraVest neither sells these interests nor values them: every
 * number here is derived from money the user tells us actually moved. Nothing in this
 * service projects a return or prices an interest, which is what keeps it a bookkeeping
 * feature rather than a securities one.
 *
 * <p>All reads and writes are scoped to the authenticated user; another user's holding is
 * indistinguishable from a non-existent one (404), same IDOR-safe rule as the directory.
 */
@Service
@RequiredArgsConstructor
public class PrivateHoldingService {

    private final PrivateHoldingRepository holdingRepository;
    private final HoldingEntryRepository entryRepository;
    private final DealRepository dealRepository;

    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    // ---- holdings ----

    public List<PrivateHoldingDto> getHoldings() {
        Long userId = getUserId();
        List<PrivateHolding> holdings = holdingRepository.findByUserIdOrderByCreatedAtDesc(userId);
        Map<Long, List<HoldingEntry>> entries = entryRepository.findByUserIdOrderByOccurredOnDescIdDesc(userId)
                .stream().collect(Collectors.groupingBy(HoldingEntry::getHoldingId));
        return holdings.stream()
                .map(h -> toDto(h, entries.getOrDefault(h.getId(), List.of())))
                .collect(Collectors.toList());
    }

    public PrivateHoldingDto getHolding(Long id) {
        PrivateHolding holding = findOwnedOrThrow(id);
        return toDto(holding, entryRepository.findByHoldingIdOrderByOccurredOnDescIdDesc(id));
    }

    public PrivateHoldingDto create(PrivateHoldingDto dto) {
        PrivateHolding holding = new PrivateHolding();
        holding.setUserId(getUserId());
        applyEditableFields(holding, dto, true);
        return toDto(holdingRepository.save(holding), List.of());
    }

    public PrivateHoldingDto update(Long id, PrivateHoldingDto dto) {
        PrivateHolding holding = findOwnedOrThrow(id);
        applyEditableFields(holding, dto, false);
        PrivateHolding saved = holdingRepository.save(holding);
        return toDto(saved, entryRepository.findByHoldingIdOrderByOccurredOnDescIdDesc(id));
    }

    @Transactional
    public void delete(Long id) {
        PrivateHolding holding = findOwnedOrThrow(id);
        entryRepository.deleteByHoldingId(holding.getId());
        holdingRepository.delete(holding);
    }

    /**
     * Start tracking a position from a Deal Room listing the user says they invested in.
     *
     * <p>This is the one link between the directory and the ledger, and it runs in exactly
     * this direction: the user tells us about a decision they already made elsewhere, and we
     * pre-fill the descriptive fields so they do not retype them. It moves no money, creates
     * no obligation, and tells the listing's poster nothing.
     */
    public PrivateHoldingDto trackFromDeal(Long dealId) {
        Long userId = getUserId();
        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        // Only a published listing, or the user's own, can be seen at all — mirror that here.
        if (!deal.getUserId().equals(userId) && !"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        if (holdingRepository.existsByUserIdAndSourceDealId(userId, dealId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "You're already tracking a holding from this listing");
        }
        PrivateHolding holding = new PrivateHolding();
        holding.setUserId(userId);
        holding.setName(deal.getTitle());
        holding.setEntityType("LLC");
        holding.setAssetType(deal.getSubcategory());
        holding.setLocation(deal.getLocation());
        holding.setSponsorContact(deal.getContactEmail());
        holding.setExternalUrl(deal.getWebsiteUrl());
        holding.setSourceDealId(dealId);
        holding.setStatus("ACTIVE");
        return toDto(holdingRepository.save(holding), List.of());
    }

    // ---- ledger ----

    public List<HoldingEntryDto> getEntries(Long holdingId) {
        findOwnedOrThrow(holdingId);
        return entryRepository.findByHoldingIdOrderByOccurredOnDescIdDesc(holdingId).stream()
                .map(PrivateHoldingService::toEntryDto).collect(Collectors.toList());
    }

    public HoldingEntryDto addEntry(Long holdingId, HoldingEntryDto dto) {
        PrivateHolding holding = findOwnedOrThrow(holdingId);
        if (dto == null || dto.getAmount() == null || dto.getAmount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An amount greater than zero is required");
        }
        if (dto.getOccurredOn() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A date is required");
        }
        String direction = normalize(dto.getDirection(), HoldingTaxonomy.DIRECTIONS, null);
        if (direction == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "direction must be CONTRIBUTION or DISTRIBUTION");
        }
        String category = trimUpperOrNull(dto.getCategory());
        if (category == null) {
            // Sensible default per direction so the simple case needs no choice.
            category = HoldingTaxonomy.CONTRIBUTION.equals(direction) ? "INITIAL" : "RENTAL_INCOME";
        }
        if (!HoldingTaxonomy.isValidCategory(direction, category)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid category '" + category + "' for " + direction);
        }

        HoldingEntry entry = new HoldingEntry();
        entry.setHoldingId(holding.getId());
        entry.setUserId(holding.getUserId());
        entry.setDirection(direction);
        entry.setCategory(category);
        entry.setAmount(dto.getAmount());
        entry.setOccurredOn(dto.getOccurredOn());
        entry.setNote(trimToNull(dto.getNote()));
        return toEntryDto(entryRepository.save(entry));
    }

    public void deleteEntry(Long holdingId, Long entryId) {
        findOwnedOrThrow(holdingId);
        HoldingEntry entry = entryRepository.findById(entryId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Entry not found"));
        if (!entry.getHoldingId().equals(holdingId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Entry not found");
        }
        entryRepository.delete(entry);
    }

    // ---- portfolio rollup ----

    /** Portfolio totals plus the concentration breakdowns. */
    public HoldingSummaryDto getSummary() {
        List<PrivateHoldingDto> holdings = getHoldings();

        HoldingSummaryDto s = new HoldingSummaryDto();
        s.setHoldingCount(holdings.size());
        s.setActiveCount((int) holdings.stream().filter(h -> "ACTIVE".equals(h.getStatus())).count());
        s.setCommitted(sum(holdings, PrivateHoldingDto::getCommittedAmount));
        s.setContributed(sum(holdings, PrivateHoldingDto::getContributed));
        s.setUncalled(sum(holdings, PrivateHoldingDto::getUncalled));
        s.setDistributed(sum(holdings, PrivateHoldingDto::getDistributed));
        s.setCapitalReturned(sum(holdings, PrivateHoldingDto::getCapitalReturned));
        s.setIncomeReceived(sum(holdings, PrivateHoldingDto::getIncomeReceived));
        s.setUnreturnedCapital(sum(holdings, PrivateHoldingDto::getUnreturnedCapital));
        s.setDistributionRatio(ratio(s.getDistributed(), s.getContributed()));

        s.setBySponsor(concentration(holdings, h -> blankToUnknown(h.getSponsorName()), s.getContributed()));
        s.setByAssetType(concentration(holdings, h -> blankToUnknown(h.getAssetType()), s.getContributed()));
        s.setByLocation(concentration(holdings, h -> blankToUnknown(h.getLocation()), s.getContributed()));
        return s;
    }

    private static String blankToUnknown(String v) {
        return (v == null || v.isBlank()) ? "Unspecified" : v;
    }

    /** Group contributed capital by a label, largest share first. */
    private List<HoldingSummaryDto.Concentration> concentration(
            List<PrivateHoldingDto> holdings,
            java.util.function.Function<PrivateHoldingDto, String> key,
            BigDecimal totalContributed) {
        Map<String, List<PrivateHoldingDto>> grouped = holdings.stream()
                .collect(Collectors.groupingBy(key, LinkedHashMap::new, Collectors.toList()));
        return grouped.entrySet().stream()
                .map(e -> {
                    BigDecimal contributed = sum(e.getValue(), PrivateHoldingDto::getContributed);
                    return new HoldingSummaryDto.Concentration(
                            e.getKey(), e.getValue().size(), contributed,
                            pct(contributed, totalContributed));
                })
                .sorted(Comparator.comparing(HoldingSummaryDto.Concentration::getContributed).reversed())
                .collect(Collectors.toList());
    }

    // ---- mapping + maths ----

    /**
     * Roll a holding's ledger into its capital account.
     *
     * <p>The distinction that matters: a distribution categorised as a return of capital,
     * refinance or sale proceeds hands the user their own basis back, while rental income
     * and capital gain are profit on top of it. Lumping them together would misstate both
     * the unreturned basis and the taxable figure.
     */
    private PrivateHoldingDto toDto(PrivateHolding h, List<HoldingEntry> entries) {
        PrivateHoldingDto dto = new PrivateHoldingDto();
        dto.setId(h.getId());
        dto.setName(h.getName());
        dto.setEntityType(h.getEntityType());
        dto.setAssetType(h.getAssetType());
        dto.setLocation(h.getLocation());
        dto.setSponsorName(h.getSponsorName());
        dto.setSponsorContact(h.getSponsorContact());
        dto.setExternalUrl(h.getExternalUrl());
        dto.setUnitsHeld(h.getUnitsHeld());
        dto.setTotalUnits(h.getTotalUnits());
        dto.setCommittedAmount(h.getCommittedAmount());
        dto.setAcquiredOn(h.getAcquiredOn());
        dto.setStatus(h.getStatus());
        dto.setSourceDealId(h.getSourceDealId());
        dto.setNotes(h.getNotes());
        dto.setCreatedAt(h.getCreatedAt());
        dto.setUpdatedAt(h.getUpdatedAt());

        BigDecimal contributed = BigDecimal.ZERO;
        BigDecimal distributed = BigDecimal.ZERO;
        BigDecimal capitalReturned = BigDecimal.ZERO;
        for (HoldingEntry e : entries) {
            BigDecimal amount = e.getAmount() == null ? BigDecimal.ZERO : e.getAmount();
            if (HoldingTaxonomy.CONTRIBUTION.equals(e.getDirection())) {
                contributed = contributed.add(amount);
            } else {
                distributed = distributed.add(amount);
                if (HoldingTaxonomy.CAPITAL_RETURNING.contains(e.getCategory())) {
                    capitalReturned = capitalReturned.add(amount);
                }
            }
        }
        dto.setContributed(contributed);
        dto.setDistributed(distributed);
        dto.setCapitalReturned(capitalReturned);
        dto.setIncomeReceived(distributed.subtract(capitalReturned));
        // Getting back more than you put in leaves nothing at risk, not a negative basis.
        dto.setUnreturnedCapital(contributed.subtract(capitalReturned).max(BigDecimal.ZERO));
        dto.setDistributionRatio(ratio(distributed, contributed));

        if (h.getCommittedAmount() != null) {
            dto.setUncalled(h.getCommittedAmount().subtract(contributed).max(BigDecimal.ZERO));
        }
        dto.setOwnershipPct(pct(h.getUnitsHeld(), h.getTotalUnits()));
        return dto;
    }

    private static HoldingEntryDto toEntryDto(HoldingEntry e) {
        return new HoldingEntryDto(e.getId(), e.getHoldingId(), e.getDirection(), e.getCategory(),
                e.getAmount(), e.getOccurredOn(), e.getNote(), e.getCreatedAt());
    }

    private void applyEditableFields(PrivateHolding holding, PrivateHoldingDto dto, boolean creating) {
        String name = dto.getName() == null ? "" : dto.getName().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        holding.setName(name);
        holding.setEntityType(normalize(dto.getEntityType(), HoldingTaxonomy.ENTITY_TYPES,
                creating ? "LLC" : holding.getEntityType()));
        holding.setAssetType(optionalEnum(dto.getAssetType(), HoldingTaxonomy.ASSET_TYPES, "assetType"));
        holding.setLocation(trimToNull(dto.getLocation()));
        holding.setSponsorName(trimToNull(dto.getSponsorName()));

        String sponsorContact = trimToNull(dto.getSponsorContact());
        if (sponsorContact != null && !sponsorContact.contains("@")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sponsorContact must be a valid email");
        }
        holding.setSponsorContact(sponsorContact);
        holding.setExternalUrl(Urls.validateOrNull(dto.getExternalUrl(), "externalUrl"));

        holding.setUnitsHeld(nonNegativeOrNull(dto.getUnitsHeld(), "unitsHeld"));
        holding.setTotalUnits(nonNegativeOrNull(dto.getTotalUnits(), "totalUnits"));
        if (holding.getUnitsHeld() != null && holding.getTotalUnits() != null
                && holding.getUnitsHeld().compareTo(holding.getTotalUnits()) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "unitsHeld cannot exceed totalUnits");
        }
        holding.setCommittedAmount(nonNegativeOrNull(dto.getCommittedAmount(), "committedAmount"));
        holding.setAcquiredOn(dto.getAcquiredOn());
        holding.setNotes(trimToNull(dto.getNotes()));
        holding.setStatus(normalize(dto.getStatus(), HoldingTaxonomy.STATUSES,
                creating ? "ACTIVE" : holding.getStatus()));
    }

    private PrivateHolding findOwnedOrThrow(Long id) {
        return holdingRepository.findByIdAndUserId(id, getUserId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Holding not found"));
    }

    private static <T> BigDecimal sum(List<T> items, java.util.function.Function<T, BigDecimal> f) {
        return items.stream().map(f).filter(v -> v != null)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    /** part/whole as a percentage, 2dp. Null when the denominator is missing or zero. */
    private static BigDecimal pct(BigDecimal part, BigDecimal whole) {
        if (part == null || whole == null || whole.signum() == 0) {
            return null;
        }
        return part.multiply(BigDecimal.valueOf(100)).divide(whole, 2, RoundingMode.HALF_UP);
    }

    /** part/whole as a plain ratio, 4dp. Null when the denominator is missing or zero. */
    private static BigDecimal ratio(BigDecimal part, BigDecimal whole) {
        if (part == null || whole == null || whole.signum() == 0) {
            return null;
        }
        return part.divide(whole, 4, RoundingMode.HALF_UP);
    }

    private String normalize(String value, Set<String> allowed, String fallback) {
        if (value == null || value.isBlank()) {
            return fallback;
        }
        String upper = value.trim().toUpperCase();
        if (!allowed.contains(upper)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid value: " + value);
        }
        return upper;
    }

    private String optionalEnum(String value, Set<String> allowed, String field) {
        String v = trimUpperOrNull(value);
        if (v == null) {
            return null;
        }
        if (!allowed.contains(v)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + field + ": " + value);
        }
        return v;
    }

    private BigDecimal nonNegativeOrNull(BigDecimal value, String field) {
        if (value == null) {
            return null;
        }
        if (value.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " cannot be negative");
        }
        return value;
    }

    private String trimUpperOrNull(String value) {
        return (value == null || value.isBlank()) ? null : value.trim().toUpperCase();
    }

    private String trimToNull(String value) {
        return (value == null || value.isBlank()) ? null : value.trim();
    }
}
