package com.mywealthmanagement.businessfinancialsservice.business.manual;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/business/manual")
@RequiredArgsConstructor
public class BusinessInventoryController {

    private final BusinessInventoryService inventoryService;
    private final ManualBusinessRepository businessRepo;
    private final BusinessTeamMemberRepository teamMemberRepo;
    private final BusinessAccessService accessService;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    @GetMapping("/businesses/{businessId}/inventory")
    public List<BusinessInventoryItem> list(@PathVariable Long businessId) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canView(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return inventoryService.list(userId, businessId);
    }

    @PostMapping("/businesses/{businessId}/inventory")
    public BusinessInventoryItem create(@PathVariable Long businessId, @RequestBody BusinessInventoryItem item) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return inventoryService.create(userId, businessId, item);
    }

    @PutMapping("/businesses/{businessId}/inventory/{id}")
    public BusinessInventoryItem update(@PathVariable Long businessId, @PathVariable Long id, @RequestBody BusinessInventoryItem item) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return inventoryService.update(userId, businessId, id, item);
    }

    @PostMapping("/businesses/{businessId}/inventory/{id}/adjust")
    public BusinessInventoryItem adjust(@PathVariable Long businessId, @PathVariable Long id, @RequestBody Map<String, Object> body) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        Integer delta = body.get("delta") instanceof Number n ? n.intValue() : null;
        if (delta == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "delta is required");
        return inventoryService.adjustStock(userId, businessId, id, delta);
    }

    @DeleteMapping("/businesses/{businessId}/inventory/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long businessId, @PathVariable Long id) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        inventoryService.delete(userId, businessId, id);
        return ResponseEntity.noContent().build();
    }
}
