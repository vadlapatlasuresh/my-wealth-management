package com.mywealthmanagement.businessfinancialsservice.business.manual;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;

@RestController
@RequestMapping("/api/v1/business/manual")
@RequiredArgsConstructor
public class BusinessPayrollController {

    private final BusinessPayrollService payrollService;
    private final ManualBusinessRepository businessRepo;
    private final BusinessTeamMemberRepository teamMemberRepo;
    private final BusinessAccessService accessService;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    @GetMapping("/businesses/{businessId}/contractors")
    public List<BusinessContractor> list(@PathVariable Long businessId) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canView(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return payrollService.listContractors(userId, businessId);
    }

    @PostMapping("/businesses/{businessId}/contractors")
    public BusinessContractor create(@PathVariable Long businessId, @RequestBody BusinessContractor contractor) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return payrollService.addContractor(userId, businessId, contractor);
    }

    @PutMapping("/businesses/{businessId}/contractors/{id}")
    public BusinessContractor update(@PathVariable Long businessId, @PathVariable Long id, @RequestBody BusinessContractor contractor) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return payrollService.updateContractor(userId, businessId, id, contractor);
    }

    @DeleteMapping("/businesses/{businessId}/contractors/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long businessId, @PathVariable Long id) {
        Long userId = userId();
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        payrollService.deleteContractor(userId, businessId, id);
        return ResponseEntity.noContent().build();
    }
}
