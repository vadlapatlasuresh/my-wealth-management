package com.mywealthmanagement.businessfinancialsservice.business.manual;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

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

    /** Ensures the caller can view this business (owner or non-invited team member); returns its owner id. */
    private void requireView(Long businessId, Long userId) {
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canView(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    /** Ensures the caller can manage this business (owner or ADMIN/EDITOR team member). */
    private void requireManage(Long businessId, Long userId) {
        ManualBusiness business = businessRepo.findById(businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (!accessService.canManage(userId, business.getUserId(), teamMemberRepo.findByBusinessIdOrderByRoleAsc(businessId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
    }

    /* ==================== Contractors ==================== */

    @GetMapping("/businesses/{businessId}/contractors")
    public List<BusinessContractor> list(@PathVariable Long businessId) {
        Long userId = userId();
        requireView(businessId, userId);
        return payrollService.listContractors(userId, businessId);
    }

    @PostMapping("/businesses/{businessId}/contractors")
    public BusinessContractor create(@PathVariable Long businessId, @RequestBody BusinessContractor contractor) {
        Long userId = userId();
        requireManage(businessId, userId);
        return payrollService.addContractor(userId, businessId, contractor);
    }

    @PutMapping("/businesses/{businessId}/contractors/{id}")
    public BusinessContractor update(@PathVariable Long businessId, @PathVariable Long id, @RequestBody BusinessContractor contractor) {
        Long userId = userId();
        requireManage(businessId, userId);
        return payrollService.updateContractor(userId, businessId, id, contractor);
    }

    @DeleteMapping("/businesses/{businessId}/contractors/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long businessId, @PathVariable Long id) {
        Long userId = userId();
        requireManage(businessId, userId);
        payrollService.deleteContractor(userId, businessId, id);
        return ResponseEntity.noContent().build();
    }

    /* ==================== Contractor payments + 1099 ==================== */

    @GetMapping("/businesses/{businessId}/contractor-payments")
    public List<BusinessContractorPayment> listPayments(@PathVariable Long businessId,
                                                        @RequestParam(required = false) Long contractorId) {
        Long userId = userId();
        requireView(businessId, userId);
        return payrollService.listPayments(userId, businessId, contractorId);
    }

    /** Pay a contractor. Body: { contractorId, amount, paidAt?, method?, reference? }. */
    @PostMapping("/businesses/{businessId}/contractor-payments")
    public BusinessContractorPayment payContractor(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        Long userId = userId();
        requireManage(businessId, userId);
        Long contractorId = asLong(body.get("contractorId"));
        if (contractorId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "contractorId is required");
        return payrollService.payContractor(userId, businessId, contractorId,
                money(body.get("amount")), date(body.get("paidAt")),
                str(body.get("method")), str(body.get("reference")));
    }

    /** Year-end 1099 totals per contractor. {@code year} defaults to the current year. */
    @GetMapping("/businesses/{businessId}/contractors/1099")
    public Map<String, Object> report1099(@PathVariable Long businessId,
                                          @RequestParam(required = false) Integer year) {
        Long userId = userId();
        requireView(businessId, userId);
        return payrollService.report1099(userId, businessId, year != null ? year : LocalDate.now().getYear());
    }

    /* ==================== Employees ==================== */

    @GetMapping("/businesses/{businessId}/employees")
    public List<BusinessEmployee> listEmployees(@PathVariable Long businessId) {
        Long userId = userId();
        requireView(businessId, userId);
        return payrollService.listEmployees(userId, businessId);
    }

    @PostMapping("/businesses/{businessId}/employees")
    public BusinessEmployee createEmployee(@PathVariable Long businessId, @RequestBody BusinessEmployee employee) {
        Long userId = userId();
        requireManage(businessId, userId);
        return payrollService.addEmployee(userId, businessId, employee);
    }

    @PutMapping("/businesses/{businessId}/employees/{id}")
    public BusinessEmployee updateEmployee(@PathVariable Long businessId, @PathVariable Long id, @RequestBody BusinessEmployee employee) {
        Long userId = userId();
        requireManage(businessId, userId);
        return payrollService.updateEmployee(userId, businessId, id, employee);
    }

    @DeleteMapping("/businesses/{businessId}/employees/{id}")
    public ResponseEntity<Void> deleteEmployee(@PathVariable Long businessId, @PathVariable Long id) {
        Long userId = userId();
        requireManage(businessId, userId);
        payrollService.deleteEmployee(userId, businessId, id);
        return ResponseEntity.noContent().build();
    }

    /* ==================== Payroll runs ==================== */

    @GetMapping("/businesses/{businessId}/payroll-runs")
    public List<BusinessPayrollRun> listPayrollRuns(@PathVariable Long businessId) {
        Long userId = userId();
        requireView(businessId, userId);
        return payrollService.listPayrollRuns(userId, businessId);
    }

    /**
     * Run payroll for one employee. Body:
     * { employeeId, gross?, hours?, periodsPerYear?, periodStart?, periodEnd?, paidAt? }.
     */
    @PostMapping("/businesses/{businessId}/payroll-runs")
    public BusinessPayrollRun runPayroll(@PathVariable Long businessId, @RequestBody Map<String, Object> body) {
        Long userId = userId();
        requireManage(businessId, userId);
        Long employeeId = asLong(body.get("employeeId"));
        if (employeeId == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "employeeId is required");
        Integer periods = body.get("periodsPerYear") instanceof Number n ? n.intValue() : null;
        return payrollService.runPayroll(userId, businessId, employeeId,
                money(body.get("gross")), money(body.get("hours")), periods,
                date(body.get("periodStart")), date(body.get("periodEnd")), date(body.get("paidAt")));
    }

    /* ---------------- helpers ---------------- */

    private static Long asLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.valueOf(String.valueOf(o).trim()); } catch (NumberFormatException e) { return null; }
    }

    private static String str(Object o) {
        if (o == null) return null;
        String s = String.valueOf(o).trim();
        return s.isEmpty() ? null : s;
    }

    private static BigDecimal money(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return new BigDecimal(n.toString());
        try { return new BigDecimal(String.valueOf(o).trim()); } catch (NumberFormatException e) { return null; }
    }

    private static LocalDate date(Object o) {
        String s = str(o);
        if (s == null) return null;
        try { return LocalDate.parse(s); } catch (RuntimeException e) { return null; }
    }
}
