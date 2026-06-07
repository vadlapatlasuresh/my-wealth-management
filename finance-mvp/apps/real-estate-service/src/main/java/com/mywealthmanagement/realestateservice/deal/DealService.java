package com.mywealthmanagement.realestateservice.deal;

import com.mywealthmanagement.realestateservice.common.Urls;
import com.mywealthmanagement.realestateservice.deal.dto.DealDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestDto;
import com.mywealthmanagement.realestateservice.deal.dto.DealInterestRequest;
import com.mywealthmanagement.realestateservice.deal.dto.MyInterestDto;
import com.mywealthmanagement.realestateservice.sponsor.SponsorProjectRepository;
import com.mywealthmanagement.realestateservice.sponsor.SponsorProjectService;
import com.mywealthmanagement.realestateservice.sponsor.dto.SponsorProjectDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CRUD for user-registered investment deals. Every operation is scoped to the
 * authenticated user; a deal owned by someone else is indistinguishable from a
 * non-existent one (returns 404) to avoid leaking existence (IDOR-safe).
 */
@Service
@RequiredArgsConstructor
public class DealService {

    private final DealRepository dealRepository;
    private final DealInterestRepository interestRepository;
    private final SponsorProjectRepository sponsorProjectRepository;

    private Long getUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /** The owner's own deals, each annotated with how many investors are interested. */
    public List<DealDto> getDeals() {
        return dealRepository.findByUserIdOrderByCreatedAtDesc(getUserId()).stream()
                .map(deal -> {
                    DealDto dto = toDto(deal);
                    dto.setInterestCount((int) interestRepository.countByDealId(deal.getId()));
                    return dto;
                })
                .collect(Collectors.toList());
    }

    /**
     * Public marketplace: OPEN deals from every sponsor, optionally filtered by category,
     * subcategory, and return type. Blank/null filters are ignored.
     */
    public List<DealDto> getMarketplace(String category, String subcategory, String returnType) {
        String cat = trimUpperOrNull(category);
        String sub = trimUpperOrNull(subcategory);
        String ret = trimUpperOrNull(returnType);
        return dealRepository.findByStatusOrderByCreatedAtDesc("OPEN").stream()
                .filter(d -> cat == null || cat.equals(d.getCategory()))
                .filter(d -> sub == null || sub.equals(d.getSubcategory()))
                .filter(d -> ret == null || ret.equals(d.getReturnType()))
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    /** The taxonomy (categories, subcategories, return types, …) for building UI dropdowns. */
    public Map<String, Object> getTaxonomy() {
        Map<String, Object> t = new java.util.LinkedHashMap<>();
        t.put("categories", DealTaxonomy.CATEGORIES);
        t.put("subcategories", DealTaxonomy.SUBCATEGORIES);
        t.put("returnTypes", DealTaxonomy.RETURN_TYPES);
        t.put("distributionFrequencies", DealTaxonomy.DISTRIBUTION_FREQUENCIES);
        t.put("statuses", DealTaxonomy.STATUSES);
        t.put("leadStatuses", DealTaxonomy.LEAD_STATUSES);
        return t;
    }

    /** Owner can view their deal in any status; everyone else only if it is OPEN. */
    public DealDto getDeal(Long id) {
        Deal deal = dealRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        boolean isOwner = deal.getUserId().equals(getUserId());
        if (!isOwner && !"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        return toDto(deal);
    }

    /**
     * Record an investor's interest in an OPEN deal and share their contact details with
     * the deal's owner. The interested user cannot express interest in their own deal.
     */
    public DealInterestDto expressInterest(Long dealId, DealInterestRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing details");
        }
        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        if (!"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This deal is not open to investors");
        }
        Long userId = getUserId();
        if (deal.getUserId().equals(userId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "You own this deal");
        }
        if (interestRepository.existsByDealIdAndInterestedUserId(deal.getId(), userId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "You've already expressed interest in this deal");
        }

        String name = request.getName() == null ? "" : request.getName().trim();
        String email = request.getEmail() == null ? "" : request.getEmail().trim();
        if (name.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Name is required");
        }
        if (!email.contains("@")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A valid email is required");
        }

        DealInterest interest = new DealInterest();
        interest.setDealId(deal.getId());
        interest.setOwnerUserId(deal.getUserId());
        interest.setInterestedUserId(userId);
        interest.setName(name);
        interest.setEmail(email);
        interest.setPhone(request.getPhone() == null ? null : request.getPhone().trim());
        interest.setMessage(request.getMessage() == null ? null : request.getMessage().trim());
        interest.setStatus("NEW");
        return toInterestDto(interestRepository.save(interest));
    }

    /** The deals the current investor has expressed interest in, with each deal's title/status. */
    public List<MyInterestDto> getMyInterests() {
        List<DealInterest> interests = interestRepository.findByInterestedUserIdOrderByCreatedAtDesc(getUserId());
        Map<Long, Deal> deals = dealRepository.findAllById(
                        interests.stream().map(DealInterest::getDealId).collect(Collectors.toList()))
                .stream().collect(Collectors.toMap(Deal::getId, d -> d));
        return interests.stream().map(i -> {
            Deal deal = deals.get(i.getDealId());
            return new MyInterestDto(
                    i.getId(), i.getDealId(),
                    deal != null ? deal.getTitle() : "(removed)",
                    deal != null ? deal.getStatus() : null,
                    i.getStatus(), i.getMessage(), i.getCreatedAt());
        }).collect(Collectors.toList());
    }

    /** Owner-only: update the lead status of an interest on one of the owner's deals. */
    public DealInterestDto updateLeadStatus(Long dealId, Long interestId, String status) {
        findOwnedOrThrow(dealId); // 404 unless caller owns the deal
        DealInterest interest = interestRepository.findById(interestId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Interest not found"));
        if (!interest.getDealId().equals(dealId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Interest not found");
        }
        String next = trimUpperOrNull(status);
        if (next == null || !DealTaxonomy.LEAD_STATUSES.contains(next)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid lead status: " + status);
        }
        interest.setStatus(next);
        return toInterestDto(interestRepository.save(interest));
    }

    /** Owner-only: the list of investors who expressed interest in one of the owner's deals. */
    public List<DealInterestDto> getInterests(Long dealId) {
        findOwnedOrThrow(dealId); // 404 unless the caller owns the deal
        return interestRepository.findByDealIdOrderByCreatedAtDesc(dealId).stream()
                .map(this::toInterestDto)
                .collect(Collectors.toList());
    }

    /**
     * The track record (previous projects) of a deal's sponsor, for investors vetting the
     * deal. Visible under the same rule as the deal itself: the deal must be OPEN, or the
     * caller must be its owner.
     */
    public List<SponsorProjectDto> getSponsorProjectsForDeal(Long dealId) {
        Deal deal = dealRepository.findById(dealId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        boolean isOwner = deal.getUserId().equals(getUserId());
        if (!isOwner && !"OPEN".equals(deal.getStatus())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        return sponsorProjectRepository.findByUserIdOrderByYearDescCreatedAtDesc(deal.getUserId()).stream()
                .map(SponsorProjectService::toDto)
                .collect(Collectors.toList());
    }

    public DealDto createDeal(DealDto dto) {
        Deal deal = new Deal();
        deal.setUserId(getUserId());
        applyEditableFields(deal, dto, true);
        return toDto(dealRepository.save(deal));
    }

    public DealDto updateDeal(Long id, DealDto dto) {
        Deal deal = findOwnedOrThrow(id);
        applyEditableFields(deal, dto, false);
        return toDto(dealRepository.save(deal));
    }

    public void deleteDeal(Long id) {
        dealRepository.delete(findOwnedOrThrow(id));
    }

    private Deal findOwnedOrThrow(Long id) {
        Deal deal = dealRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found"));
        if (!deal.getUserId().equals(getUserId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Deal not found");
        }
        return deal;
    }

    private void applyEditableFields(Deal deal, DealDto dto, boolean creating) {
        String title = dto.getTitle() == null ? "" : dto.getTitle().trim();
        if (title.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required");
        }
        deal.setTitle(title);

        String category = normalize(dto.getCategory(), DealTaxonomy.CATEGORIES, "OTHER");
        deal.setCategory(category);

        // Subcategory is optional, but if present must belong to the chosen category.
        String subcategory = trimUpperOrNull(dto.getSubcategory());
        if (subcategory != null && !DealTaxonomy.isValidSubcategory(category, subcategory)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Invalid subcategory '" + subcategory + "' for category " + category);
        }
        deal.setSubcategory(subcategory);

        // Return structure.
        String returnType = optionalEnum(dto.getReturnType(), DealTaxonomy.RETURN_TYPES, "returnType");
        deal.setReturnType(returnType);
        BigDecimal rMin = percentOrNull(dto.getAnnualReturnMin(), "annualReturnMin");
        BigDecimal rMax = percentOrNull(dto.getAnnualReturnMax(), "annualReturnMax");
        if (rMin != null && rMax != null && rMin.compareTo(rMax) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "annualReturnMin cannot exceed annualReturnMax");
        }
        deal.setAnnualReturnMin(rMin);
        deal.setAnnualReturnMax(rMax);
        deal.setDistributionFrequency(optionalEnum(dto.getDistributionFrequency(),
                DealTaxonomy.DISTRIBUTION_FREQUENCIES, "distributionFrequency"));

        deal.setDescription(dto.getDescription());
        deal.setLocation(dto.getLocation());
        deal.setWebsiteUrl(Urls.validateOrNull(dto.getWebsiteUrl(), "websiteUrl"));
        deal.setTargetRaise(nonNegativeOrNull(dto.getTargetRaise(), "targetRaise"));
        deal.setMinInvestment(nonNegativeOrNull(dto.getMinInvestment(), "minInvestment"));
        deal.setTargetIrr(percentOrNull(dto.getTargetIrr(), "targetIrr"));
        deal.setHoldPeriodMonths(dto.getHoldPeriodMonths());

        // Status defaults to DRAFT on create; on update keep the existing value if omitted.
        String defaultStatus = creating ? "DRAFT" : deal.getStatus();
        deal.setStatus(normalize(dto.getStatus(), DealTaxonomy.STATUSES, defaultStatus));

        if (dto.getAmountCommitted() != null) {
            deal.setAmountCommitted(nonNegativeOrNull(dto.getAmountCommitted(), "amountCommitted"));
        } else if (deal.getAmountCommitted() == null) {
            deal.setAmountCommitted(BigDecimal.ZERO);
        }
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

    private BigDecimal nonNegativeOrNull(BigDecimal value, String field) {
        if (value == null) {
            return null;
        }
        if (value.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " cannot be negative");
        }
        return value;
    }

    /** A percentage value: non-negative and capped at a sane 1000% to catch fat-finger input. */
    private BigDecimal percentOrNull(BigDecimal value, String field) {
        BigDecimal v = nonNegativeOrNull(value, field);
        if (v != null && v.compareTo(BigDecimal.valueOf(1000)) > 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, field + " looks too large");
        }
        return v;
    }

    private String trimUpperOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim().toUpperCase();
    }

    /** Optional enum: null/blank -> null; otherwise must be in {@code allowed}. */
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

    private DealDto toDto(Deal d) {
        DealDto dto = new DealDto();
        dto.setId(d.getId());
        dto.setTitle(d.getTitle());
        dto.setCategory(d.getCategory());
        dto.setSubcategory(d.getSubcategory());
        dto.setReturnType(d.getReturnType());
        dto.setAnnualReturnMin(d.getAnnualReturnMin());
        dto.setAnnualReturnMax(d.getAnnualReturnMax());
        dto.setDistributionFrequency(d.getDistributionFrequency());
        dto.setDescription(d.getDescription());
        dto.setLocation(d.getLocation());
        dto.setWebsiteUrl(d.getWebsiteUrl());
        dto.setTargetRaise(d.getTargetRaise());
        dto.setMinInvestment(d.getMinInvestment());
        dto.setTargetIrr(d.getTargetIrr());
        dto.setHoldPeriodMonths(d.getHoldPeriodMonths());
        dto.setStatus(d.getStatus());
        dto.setAmountCommitted(d.getAmountCommitted());
        dto.setCreatedAt(d.getCreatedAt());
        dto.setUpdatedAt(d.getUpdatedAt());
        return dto;
    }

    private DealInterestDto toInterestDto(DealInterest i) {
        return new DealInterestDto(
                i.getId(),
                i.getDealId(),
                i.getName(),
                i.getEmail(),
                i.getPhone(),
                i.getMessage(),
                i.getStatus(),
                i.getCreatedAt()
        );
    }
}
