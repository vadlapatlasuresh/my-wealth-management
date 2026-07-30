package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BusinessInventoryService {

    private final BusinessInventoryItemRepository repo;
    private final BusinessInventoryMovementRepository movementRepo;
    private final LedgerPostingService ledgerPosting;

    @Transactional
    public BusinessInventoryItem create(Long userId, Long businessId, BusinessInventoryItem item) {
        item.setUserId(userId);
        item.setBusinessId(businessId);
        if (item.getStatus() == null || item.getStatus().isBlank()) item.setStatus("ACTIVE");
        if (item.getOnHand() == null) item.setOnHand(0);
        return repo.save(item);
    }

    @Transactional(readOnly = true)
    public List<BusinessInventoryItem> list(Long userId, Long businessId) {
        return repo.findByBusinessIdOrderByNameAsc(businessId);
    }

    /** Items at or below their reorder point (low-stock alerts). Items without a reorder point are skipped. */
    @Transactional(readOnly = true)
    public List<BusinessInventoryItem> lowStock(Long userId, Long businessId) {
        return repo.findByBusinessIdOrderByNameAsc(businessId).stream()
                .filter(i -> i.getReorderPoint() != null
                        && (i.getOnHand() == null ? 0 : i.getOnHand()) <= i.getReorderPoint())
                .toList();
    }

    @Transactional(readOnly = true)
    public List<BusinessInventoryMovement> movements(Long userId, Long businessId, Long itemId) {
        // Ensure the item is in this business before exposing its history.
        repo.findByIdAndBusinessId(itemId, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found"));
        return movementRepo.findByItemIdOrderByIdDesc(itemId);
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

    /**
     * Change stock by {@code delta} (+ receive / − sell or shrinkage), recording an auditable
     * {@link BusinessInventoryMovement} and posting a cost-valued, idempotent ledger entry keyed
     * on that movement. {@code kind} is RECEIVE | SELL | ADJUST (defaults from the sign).
     */
    @Transactional
    public BusinessInventoryItem adjustStock(Long userId, Long businessId, Long id, Integer delta, String kind, String note) {
        if (delta == null || delta == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A non-zero delta is required");
        }
        BusinessInventoryItem item = repo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found"));
        int current = item.getOnHand() == null ? 0 : item.getOnHand();
        int next = current + delta;
        if (next < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Inventory on hand cannot go below zero");
        }
        item.setOnHand(next);
        BusinessInventoryItem saved = repo.save(item);

        BusinessInventoryMovement movement = new BusinessInventoryMovement();
        movement.setUserId(userId);
        movement.setBusinessId(businessId);
        movement.setItemId(id);
        movement.setKind(normalizeKind(kind, delta));
        movement.setDelta(delta);
        movement.setUnitCost(item.getCostPrice());
        movement.setNote(note);
        BusinessInventoryMovement savedMove = movementRepo.save(movement);

        // Post to the GL, valued at cost. Best-effort + idempotent (keyed on the movement id).
        ledgerPosting.postInventoryMovement(savedMove, saved);
        return saved;
    }

    private static String normalizeKind(String kind, int delta) {
        if (kind != null && !kind.isBlank()) {
            String k = kind.trim().toUpperCase();
            if (k.equals("RECEIVE") || k.equals("SELL") || k.equals("ADJUST")) return k;
        }
        return delta > 0 ? "RECEIVE" : "ADJUST";
    }

    @Transactional
    public void delete(Long userId, Long businessId, Long id) {
        BusinessInventoryItem item = repo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found"));
        // Movements (and their history) cascade at the DB. Posted GL entries are real, past
        // economic events and stay on the ledger — deleting the item master never rewrites history.
        repo.delete(item);
    }

    // Backwards-compatible overload (sign-derived kind, no note).
    @Transactional
    public BusinessInventoryItem adjustStock(Long userId, Long businessId, Long id, Integer delta) {
        return adjustStock(userId, businessId, id, delta, null, null);
    }
}
