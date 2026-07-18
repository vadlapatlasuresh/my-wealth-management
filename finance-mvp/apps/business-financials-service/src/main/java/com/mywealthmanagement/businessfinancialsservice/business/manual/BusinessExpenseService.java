package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseSummaryDto;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;

/**
 * Expense records per business. See {@link BusinessExpense} for why STANDALONE and LINKED
 * expenses are totalled separately — it is what keeps the tracker from double-counting the
 * transaction ledger that already backs the P&amp;L widgets.
 */
@Service
@RequiredArgsConstructor
public class BusinessExpenseService {

    /** Suggestions only — category is free text so it stays aligned with ledger/budget categories. */
    public static final List<String> SUGGESTED_CATEGORIES = List.of(
            "Advertising & Marketing", "Bank & Merchant Fees", "Contractors & Freelancers",
            "Software & Subscriptions", "Insurance", "Legal & Professional",
            "Meals & Entertainment", "Office Supplies", "Rent & Utilities", "Payroll",
            "Travel", "Taxes & Licenses", "Vehicle & Fuel", "Repairs & Maintenance",
            "Shipping & Postage", "Education & Training", "Other"
    );

    private static final Set<String> STATUSES =
            Set.of("RECORDED", "NEEDS_RECEIPT", "APPROVED", "REIMBURSED");

    private final BusinessExpenseRepository expenseRepo;
    private final BusinessExpenseLinkRepository linkRepo;
    private final ManualBusinessRepository businessRepo;

    /* ------------------------------ queries ------------------------------ */

    public List<BusinessExpenseDto> list(Long userId, Long businessId, LocalDate from, LocalDate to,
                                         String category, String vendor, String status) {
        requireBusiness(userId, businessId);
        List<BusinessExpense> rows = (from != null && to != null)
                ? expenseRepo.findByUserIdAndBusinessIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(userId, businessId, from, to)
                : expenseRepo.findByUserIdAndBusinessIdOrderByExpenseDateDescIdDesc(userId, businessId);
        rows = rows.stream()
                .filter(e -> category == null || category.isBlank() || category.equalsIgnoreCase(e.getCategory()))
                .filter(e -> vendor == null || vendor.isBlank() || vendor.equalsIgnoreCase(e.getVendor()))
                .filter(e -> status == null || status.isBlank() || status.equalsIgnoreCase(e.getStatus()))
                .collect(Collectors.toList());
        return toDtos(rows);
    }

    /** All of the user's expenses across every business — backs the consolidated export. */
    public List<BusinessExpenseDto> listAll(Long userId, LocalDate from, LocalDate to) {
        List<BusinessExpense> rows = (from != null && to != null)
                ? expenseRepo.findByUserIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(userId, from, to)
                : expenseRepo.findByUserIdOrderByExpenseDateDescIdDesc(userId);
        return toDtos(rows);
    }

    /* ------------------------------ mutations ------------------------------ */

    @Transactional
    public BusinessExpenseDto create(Long userId, Long businessId, BusinessExpenseDto dto) {
        requireBusiness(userId, businessId);
        BusinessExpense e = new BusinessExpense();
        e.setUserId(userId);
        e.setBusinessId(businessId);
        apply(e, dto);
        // A LINKED expense has no links yet at creation time, so amount validation for it is
        // deferred until links are attached (the UI creates then links in one flow).
        return toDto(expenseRepo.save(e), List.of());
    }

    @Transactional
    public BusinessExpenseDto update(Long userId, Long expenseId, BusinessExpenseDto dto) {
        BusinessExpense e = ownedExpense(userId, expenseId);
        apply(e, dto);
        BusinessExpense saved = expenseRepo.save(e);
        return toDto(saved, linkRepo.findByExpenseIdOrderByTxDateDescIdDesc(saved.getId()));
    }

    @Transactional
    public void delete(Long userId, Long expenseId) {
        BusinessExpense e = ownedExpense(userId, expenseId);
        linkRepo.deleteByExpenseId(e.getId()); // explicit, so it works on stores without FK cascade (H2 tests)
        expenseRepo.delete(e);
    }

    /**
     * Attach transactions. Re-linking the same transaction is a no-op rather than an error,
     * so a double-submit or an overlapping multi-select can't create duplicates.
     */
    @Transactional
    public BusinessExpenseDto addLinks(Long userId, Long expenseId, List<BusinessExpenseDto.LinkDto> links) {
        BusinessExpense e = ownedExpense(userId, expenseId);
        if (links == null || links.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No transactions supplied");
        }
        for (BusinessExpenseDto.LinkDto in : links) {
            String source = normalizeSource(in.getTxSource());
            String ref = in.getTxRef() == null ? null : in.getTxRef().trim();
            if (ref == null || ref.isBlank()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "txRef is required for every link");
            }
            if (linkRepo.findByExpenseIdAndTxSourceAndTxRef(e.getId(), source, ref).isPresent()) {
                continue; // idempotent
            }
            BusinessExpenseLink link = new BusinessExpenseLink();
            link.setExpenseId(e.getId());
            link.setUserId(userId);
            link.setTxSource(source);
            link.setTxRef(ref);
            link.setTxDate(in.getTxDate());
            link.setTxAmount(in.getTxAmount());
            link.setTxDescription(trim(in.getTxDescription(), 500));
            link.setTxMerchant(trim(in.getTxMerchant(), 200));
            link.setTxAccount(trim(in.getTxAccount(), 200));
            linkRepo.save(link);
        }
        // Attaching a transaction makes this a LINKED expense; its own amount no longer applies.
        e.setSourceMode(BusinessExpense.MODE_LINKED);
        e.setAmount(null);
        BusinessExpense saved = expenseRepo.save(e);
        return toDto(saved, linkRepo.findByExpenseIdOrderByTxDateDescIdDesc(saved.getId()));
    }

    @Transactional
    public BusinessExpenseDto removeLink(Long userId, Long expenseId, Long linkId) {
        BusinessExpense e = ownedExpense(userId, expenseId);
        BusinessExpenseLink link = linkRepo.findByIdAndUserId(linkId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Link not found"));
        if (!link.getExpenseId().equals(e.getId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Link not found");
        }
        linkRepo.delete(link);
        List<BusinessExpenseLink> remaining = linkRepo.findByExpenseIdOrderByTxDateDescIdDesc(e.getId());
        if (remaining.isEmpty()) {
            // Last link removed — fall back to a standalone (zero) expense the user can edit,
            // rather than leaving a LINKED expense worth nothing with no explanation.
            e.setSourceMode(BusinessExpense.MODE_STANDALONE);
            if (e.getAmount() == null) e.setAmount(BigDecimal.ZERO);
            e = expenseRepo.save(e);
        }
        return toDto(e, remaining);
    }

    /* ------------------------------ summary ------------------------------ */

    public ExpenseSummaryDto summary(Long userId, Long businessId, LocalDate from, LocalDate to) {
        List<BusinessExpenseDto> rows = (businessId != null)
                ? list(userId, businessId, from, to, null, null, null)
                : listAll(userId, from, to);

        BigDecimal standalone = BigDecimal.ZERO;
        BigDecimal linked = BigDecimal.ZERO;
        int missingReceipts = 0;
        int uncategorized = 0;
        Map<String, BigDecimal> byCat = new LinkedHashMap<>();
        Map<String, Integer> byCatN = new HashMap<>();
        Map<String, BigDecimal> byVendor = new LinkedHashMap<>();
        Map<String, Integer> byVendorN = new HashMap<>();
        Map<String, BigDecimal> byMonth = new TreeMap<>();
        Map<String, Integer> byMonthN = new HashMap<>();
        Map<Long, BigDecimal> byBiz = new LinkedHashMap<>();
        Map<Long, Integer> byBizN = new HashMap<>();

        for (BusinessExpenseDto e : rows) {
            BigDecimal amt = e.getEffectiveAmount() == null ? BigDecimal.ZERO : e.getEffectiveAmount();
            if (BusinessExpense.MODE_LINKED.equals(e.getSourceMode())) linked = linked.add(amt);
            else standalone = standalone.add(amt);

            if (e.getReceiptDocumentId() == null) missingReceipts++;
            String cat = (e.getCategory() == null || e.getCategory().isBlank()) ? "Uncategorized" : e.getCategory();
            if ("Uncategorized".equals(cat)) uncategorized++;

            byCat.merge(cat, amt, BigDecimal::add);
            byCatN.merge(cat, 1, Integer::sum);

            String ven = (e.getVendor() == null || e.getVendor().isBlank()) ? "—" : e.getVendor();
            byVendor.merge(ven, amt, BigDecimal::add);
            byVendorN.merge(ven, 1, Integer::sum);

            if (e.getExpenseDate() != null) {
                String m = String.format("%04d-%02d", e.getExpenseDate().getYear(), e.getExpenseDate().getMonthValue());
                byMonth.merge(m, amt, BigDecimal::add);
                byMonthN.merge(m, 1, Integer::sum);
            }
            if (e.getBusinessId() != null) {
                byBiz.merge(e.getBusinessId(), amt, BigDecimal::add);
                byBizN.merge(e.getBusinessId(), 1, Integer::sum);
            }
        }

        List<ExpenseSummaryDto.Bucket> byBusiness = null;
        if (businessId == null && !byBiz.isEmpty()) {
            Map<Long, String> names = businessRepo.findByUserIdOrderByCreatedAtAsc(userId).stream()
                    .collect(Collectors.toMap(ManualBusiness::getId, b -> b.getName() == null ? ("Business " + b.getId()) : b.getName(), (a, b) -> a));
            byBusiness = byBiz.entrySet().stream()
                    .map(en -> new ExpenseSummaryDto.Bucket(
                            names.getOrDefault(en.getKey(), "Business " + en.getKey()),
                            en.getValue(), byBizN.getOrDefault(en.getKey(), 0)))
                    .sorted((a, b) -> b.getTotal().compareTo(a.getTotal()))
                    .collect(Collectors.toList());
        }

        return new ExpenseSummaryDto(
                businessId,
                from == null ? null : from.toString(),
                to == null ? null : to.toString(),
                standalone.add(linked), standalone, linked,
                rows.size(), missingReceipts, uncategorized,
                buckets(byCat, byCatN, true),
                buckets(byVendor, byVendorN, true),
                buckets(byMonth, byMonthN, false),   // chronological for the trend chart
                byBusiness);
    }

    /* ------------------------------ helpers ------------------------------ */

    private static List<ExpenseSummaryDto.Bucket> buckets(Map<String, BigDecimal> totals,
                                                          Map<String, Integer> counts,
                                                          boolean sortByTotalDesc) {
        var stream = totals.entrySet().stream()
                .map(e -> new ExpenseSummaryDto.Bucket(e.getKey(), e.getValue(), counts.getOrDefault(e.getKey(), 0)));
        if (sortByTotalDesc) {
            stream = stream.sorted((a, b) -> b.getTotal().compareTo(a.getTotal()));
        }
        return stream.collect(Collectors.toList());
    }

    private void apply(BusinessExpense e, BusinessExpenseDto dto) {
        if (dto.getExpenseDate() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "expenseDate is required");
        }
        if (dto.getCategory() == null || dto.getCategory().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "category is required");
        }
        String mode = dto.getSourceMode() == null || dto.getSourceMode().isBlank()
                ? BusinessExpense.MODE_STANDALONE
                : dto.getSourceMode().trim().toUpperCase(Locale.ROOT);
        if (!BusinessExpense.MODE_STANDALONE.equals(mode) && !BusinessExpense.MODE_LINKED.equals(mode)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "sourceMode must be STANDALONE or LINKED");
        }
        if (BusinessExpense.MODE_STANDALONE.equals(mode)) {
            if (dto.getAmount() == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount is required for a standalone expense");
            }
            if (dto.getAmount().signum() < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "amount must be zero or positive");
            }
            e.setAmount(dto.getAmount());
        } else {
            e.setAmount(null); // derived from links
        }
        String status = dto.getStatus() == null || dto.getStatus().isBlank()
                ? "RECORDED" : dto.getStatus().trim().toUpperCase(Locale.ROOT);
        if (!STATUSES.contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown status: " + status);
        }
        e.setSourceMode(mode);
        e.setStatus(status);
        e.setExpenseDate(dto.getExpenseDate());
        e.setCategory(trim(dto.getCategory(), 80));
        e.setVendor(trim(dto.getVendor(), 200));
        e.setDescription(trim(dto.getDescription(), 500));
        e.setPaymentMethod(trim(dto.getPaymentMethod(), 40));
        e.setReceiptDocumentId(dto.getReceiptDocumentId());
        e.setNotes(trim(dto.getNotes(), 1000));
    }

    private void requireBusiness(Long userId, Long businessId) {
        businessRepo.findByIdAndUserId(businessId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Business not found"));
    }

    private BusinessExpense ownedExpense(Long userId, Long expenseId) {
        return expenseRepo.findByIdAndUserId(expenseId, userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found"));
    }

    private static String normalizeSource(String s) {
        String v = s == null ? "" : s.trim().toUpperCase(Locale.ROOT);
        if (BusinessExpenseLink.SOURCE_MANUAL.equals(v) || BusinessExpenseLink.SOURCE_LINKED.equals(v)) {
            return v;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "txSource must be MANUAL or LINKED");
    }

    private static String trim(String s, int max) {
        if (s == null) return null;
        String t = s.trim();
        if (t.isEmpty()) return null;
        return t.length() > max ? t.substring(0, max) : t;
    }

    /** Batch-loads links so a list of N expenses costs one extra query, not N. */
    private List<BusinessExpenseDto> toDtos(List<BusinessExpense> rows) {
        if (rows.isEmpty()) return List.of();
        List<Long> ids = rows.stream().map(BusinessExpense::getId).toList();
        Map<Long, List<BusinessExpenseLink>> byExpense = linkRepo.findByExpenseIdIn(ids).stream()
                .collect(Collectors.groupingBy(BusinessExpenseLink::getExpenseId));
        return rows.stream()
                .map(e -> toDto(e, byExpense.getOrDefault(e.getId(), List.of())))
                .collect(Collectors.toList());
    }

    private BusinessExpenseDto toDto(BusinessExpense e, List<BusinessExpenseLink> links) {
        BigDecimal effective;
        if (BusinessExpense.MODE_LINKED.equals(e.getSourceMode())) {
            // Ledger amounts are signed (negative = money out); an expense is a magnitude.
            effective = links.stream()
                    .map(l -> l.getTxAmount() == null ? BigDecimal.ZERO : l.getTxAmount().abs())
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
        } else {
            effective = e.getAmount() == null ? BigDecimal.ZERO : e.getAmount();
        }
        List<BusinessExpenseDto.LinkDto> linkDtos = links.stream()
                .map(l -> new BusinessExpenseDto.LinkDto(
                        l.getId(), l.getTxSource(), l.getTxRef(), l.getTxDate(), l.getTxAmount(),
                        l.getTxDescription(), l.getTxMerchant(), l.getTxAccount(), l.getLinkedAt()))
                .collect(Collectors.toList());
        return new BusinessExpenseDto(
                e.getId(), e.getBusinessId(), e.getExpenseDate(), e.getCategory(), e.getVendor(),
                e.getDescription(), e.getAmount(), e.getSourceMode(), e.getStatus(),
                e.getPaymentMethod(), e.getReceiptDocumentId(), e.getNotes(),
                effective, linkDtos.size(), linkDtos, e.getCreatedAt(), e.getUpdatedAt());
    }
}
