package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

@Service
@RequiredArgsConstructor
public class BusinessInventoryService {

    private final BusinessInventoryItemRepository repo;
    private final LedgerService ledgerService;

    @Transactional
    public BusinessInventoryItem create(Long userId, Long businessId, BusinessInventoryItem item) {
        item.setUserId(userId);
        item.setBusinessId(businessId);
        if (item.getStatus() == null || item.getStatus().isBlank()) item.setStatus("ACTIVE");
        if (item.getOnHand() == null) item.setOnHand(0);
        return repo.save(item);
    }

    @Transactional(readOnly = true)
    public java.util.List<BusinessInventoryItem> list(Long userId, Long businessId) {
        return repo.findByBusinessIdOrderByNameAsc(businessId);
    }

    @Transactional
    public BusinessInventoryItem update(Long userId, Long businessId, Long id, BusinessInventoryItem updates) {
        BusinessInventoryItem item = repo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found"));
        if (updates.getName() != null && !updates.getName().isBlank()) item.setName(updates.getName());
        if (updates.getSku() != null) item.setSku(updates.getSku());
        if (updates.getCostPrice() != null) item.setCostPrice(updates.getCostPrice());
        if (updates.getSellPrice() != null) item.setSellPrice(updates.getSellPrice());
        if (updates.getReorderPoint() != null) item.setReorderPoint(updates.getReorderPoint());
        if (updates.getNotes() != null) item.setNotes(updates.getNotes());
        if (updates.getStatus() != null && !updates.getStatus().isBlank()) item.setStatus(updates.getStatus());
        if (item.getOnHand() == null) item.setOnHand(0);
        return repo.save(item);
    }

    @Transactional
    public BusinessInventoryItem adjustStock(Long userId, Long businessId, Long id, Integer delta) {
        BusinessInventoryItem item = repo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found"));
        int current = item.getOnHand() == null ? 0 : item.getOnHand();
        int next = current + Objects.requireNonNullElse(delta, 0);
        if (next < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inventory on hand cannot go below zero");
        }
        item.setOnHand(next);
        BusinessInventoryItem saved = repo.save(item);
        if (item.getCostPrice() != null && item.getCostPrice().signum() > 0) {
            BigDecimal amount = item.getCostPrice().multiply(BigDecimal.valueOf(Math.abs(delta)));
            List<LedgerService.LineInput> lines = delta > 0
                    ? List.of(
                            new LedgerService.LineInput("1200", amount, null, "Inventory received"),
                            new LedgerService.LineInput("5000", null, amount, "Inventory adjustment"))
                    : List.of(
                            new LedgerService.LineInput("5000", amount, null, "Inventory adjustment"),
                            new LedgerService.LineInput("1200", null, amount, "Inventory reduced"));
            ledgerService.post(businessId, userId, LocalDate.now(), "Inventory adjustment - " + item.getName(),
                    "INVENTORY_ADJUSTMENT", String.valueOf(id), lines);
        }
        return saved;
    }

    @Transactional
    public void delete(Long userId, Long businessId, Long id) {
        BusinessInventoryItem item = repo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found"));
        repo.delete(item);
    }
}
