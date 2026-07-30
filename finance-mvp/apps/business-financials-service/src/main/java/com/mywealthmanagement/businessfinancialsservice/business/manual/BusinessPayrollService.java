package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Payroll domain (Phase 5): 1099 contractors + their payments + year-end 1099 totals, and
 * W-2 employees + payroll runs. Every real payment (contractor payment, payroll run) posts to
 * the GL; simply <em>creating</em> a contractor or employee record posts nothing.
 */
@Service
@RequiredArgsConstructor
public class BusinessPayrollService {

    /** The IRS reporting threshold above which a 1099-NEC is required for a contractor. */
    private static final BigDecimal THRESHOLD_1099 = new BigDecimal("600");

    private final BusinessContractorRepository contractorRepo;
    private final BusinessContractorPaymentRepository paymentRepo;
    private final BusinessEmployeeRepository employeeRepo;
    private final BusinessPayrollRunRepository runRepo;
    private final LedgerPostingService ledgerPosting;

    /* ==================== Contractors ==================== */

    @Transactional
    public BusinessContractor addContractor(Long userId, Long businessId, BusinessContractor contractor) {
        contractor.setUserId(userId);
        contractor.setBusinessId(businessId);
        if (contractor.getTaxForm() == null || contractor.getTaxForm().isBlank()) {
            contractor.setTaxForm("1099");
        }
        if (contractor.getStatus() == null || contractor.getStatus().isBlank()) {
            contractor.setStatus("ACTIVE");
        }
        // NOTE: creating a contractor is not an economic event — no ledger posting here.
        // The expense hits the ledger when the contractor is actually paid (see payContractor).
        return contractorRepo.save(contractor);
    }

    @Transactional
    public BusinessContractor updateContractor(Long userId, Long businessId, Long id, BusinessContractor updates) {
        BusinessContractor contractor = contractorRepo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Contractor not found"));
        if (updates.getName() != null && !updates.getName().isBlank()) contractor.setName(updates.getName());
        if (updates.getEmail() != null) contractor.setEmail(updates.getEmail());
        if (updates.getPhone() != null) contractor.setPhone(updates.getPhone());
        if (updates.getTaxForm() != null && !updates.getTaxForm().isBlank()) contractor.setTaxForm(updates.getTaxForm());
        if (updates.getAmount() != null) contractor.setAmount(updates.getAmount());
        if (updates.getPaymentTerms() != null) contractor.setPaymentTerms(updates.getPaymentTerms());
        if (updates.getStatus() != null && !updates.getStatus().isBlank()) contractor.setStatus(updates.getStatus());
        return contractorRepo.save(contractor);
    }

    @Transactional(readOnly = true)
    public List<BusinessContractor> listContractors(Long userId, Long businessId) {
        return contractorRepo.findByBusinessIdOrderByNameAsc(businessId);
    }

    @Transactional
    public void deleteContractor(Long userId, Long businessId, Long id) {
        BusinessContractor contractor = contractorRepo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Contractor not found"));
        // Payments (and their history) cascade at the DB; posted GL expenses stay on the ledger.
        contractorRepo.delete(contractor);
    }

    /* ==================== Contractor payments + 1099 ==================== */

    /** Record and post a payment to a contractor (DR 6000 Operating Expenses / CR 1000 Cash). */
    @Transactional
    public BusinessContractorPayment payContractor(Long userId, Long businessId, Long contractorId,
                                                   BigDecimal amount, LocalDate paidAt, String method, String reference) {
        BusinessContractor contractor = contractorRepo.findByIdAndBusinessId(contractorId, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Contractor not found"));
        if (amount == null || amount.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A positive payment amount is required");
        }
        BusinessContractorPayment p = new BusinessContractorPayment();
        p.setUserId(userId);
        p.setBusinessId(businessId);
        p.setContractorId(contractorId);
        p.setAmount(amount.setScale(2, RoundingMode.HALF_UP));
        p.setPaidAt(paidAt != null ? paidAt : LocalDate.now());
        p.setMethod(method);
        p.setReference(reference);
        BusinessContractorPayment saved = paymentRepo.save(p);
        ledgerPosting.postContractorPayment(saved, contractor.getName());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<BusinessContractorPayment> listPayments(Long userId, Long businessId, Long contractorId) {
        if (contractorId != null) return paymentRepo.findByContractorIdOrderByPaidAtDescIdDesc(contractorId);
        return paymentRepo.findByBusinessIdOrderByPaidAtDescIdDesc(businessId);
    }

    /**
     * Year-end 1099 report: total paid to each contractor within {@code year}, flagged when the
     * total reaches the $600 IRS reporting threshold. Rows are ordered by amount, largest first.
     */
    @Transactional(readOnly = true)
    public Map<String, Object> report1099(Long userId, Long businessId, int year) {
        LocalDate from = LocalDate.of(year, 1, 1);
        LocalDate to = LocalDate.of(year, 12, 31);
        Map<Long, BigDecimal> totals = new LinkedHashMap<>();
        for (BusinessContractorPayment p : paymentRepo.findByBusinessIdAndPaidAtBetween(businessId, from, to)) {
            totals.merge(p.getContractorId(), p.getAmount() == null ? BigDecimal.ZERO : p.getAmount(), BigDecimal::add);
        }
        Map<Long, BusinessContractor> byId = new LinkedHashMap<>();
        for (BusinessContractor c : contractorRepo.findByBusinessIdOrderByNameAsc(businessId)) byId.put(c.getId(), c);

        List<Map<String, Object>> rows = new ArrayList<>();
        BigDecimal grandTotal = BigDecimal.ZERO;
        for (Map.Entry<Long, BigDecimal> e : totals.entrySet()) {
            BusinessContractor c = byId.get(e.getKey());
            BigDecimal total = e.getValue();
            grandTotal = grandTotal.add(total);
            Map<String, Object> r = new LinkedHashMap<>();
            r.put("contractorId", e.getKey());
            r.put("name", c != null ? c.getName() : "(deleted contractor)");
            r.put("email", c != null ? c.getEmail() : null);
            r.put("taxForm", c != null ? c.getTaxForm() : "1099");
            r.put("total", total);
            r.put("reportable", total.compareTo(THRESHOLD_1099) >= 0);
            rows.add(r);
        }
        rows.sort((a, b) -> ((BigDecimal) b.get("total")).compareTo((BigDecimal) a.get("total")));

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("year", year);
        out.put("threshold", THRESHOLD_1099);
        out.put("rows", rows);
        out.put("grandTotal", grandTotal);
        out.put("reportableCount", rows.stream().filter(r -> Boolean.TRUE.equals(r.get("reportable"))).count());
        return out;
    }

    /* ==================== Employees + payroll runs ==================== */

    @Transactional
    public BusinessEmployee addEmployee(Long userId, Long businessId, BusinessEmployee employee) {
        employee.setUserId(userId);
        employee.setBusinessId(businessId);
        if (employee.getName() == null || employee.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "An employee name is required");
        }
        if (employee.getPayType() == null || employee.getPayType().isBlank()) employee.setPayType("SALARY");
        employee.setPayType(employee.getPayType().toUpperCase());
        if (employee.getStatus() == null || employee.getStatus().isBlank()) employee.setStatus("ACTIVE");
        return employeeRepo.save(employee);
    }

    @Transactional
    public BusinessEmployee updateEmployee(Long userId, Long businessId, Long id, BusinessEmployee updates) {
        BusinessEmployee emp = employeeRepo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found"));
        if (updates.getName() != null && !updates.getName().isBlank()) emp.setName(updates.getName());
        if (updates.getEmail() != null) emp.setEmail(updates.getEmail());
        if (updates.getPayType() != null && !updates.getPayType().isBlank()) emp.setPayType(updates.getPayType().toUpperCase());
        if (updates.getPayRate() != null) emp.setPayRate(updates.getPayRate());
        if (updates.getFedWhPct() != null) emp.setFedWhPct(updates.getFedWhPct());
        if (updates.getStateWhPct() != null) emp.setStateWhPct(updates.getStateWhPct());
        if (updates.getFicaPct() != null) emp.setFicaPct(updates.getFicaPct());
        if (updates.getStatus() != null && !updates.getStatus().isBlank()) emp.setStatus(updates.getStatus());
        return employeeRepo.save(emp);
    }

    @Transactional(readOnly = true)
    public List<BusinessEmployee> listEmployees(Long userId, Long businessId) {
        return employeeRepo.findByBusinessIdOrderByNameAsc(businessId);
    }

    @Transactional
    public void deleteEmployee(Long userId, Long businessId, Long id) {
        BusinessEmployee emp = employeeRepo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found"));
        employeeRepo.delete(emp);
    }

    /**
     * Process one payroll run for an employee: computes gross, estimated withholdings (from the
     * employee's owner-set percentages) and net, saves the paystub, and posts it to the GL.
     *
     * <p>Gross: an explicit {@code gross} wins; otherwise HOURLY = rate × hours, SALARY = annual
     * pay ÷ {@code periodsPerYear} (default 26 / bi-weekly). Withholdings are ESTIMATES, not IRS
     * tables — clearly labelled as such in the UI.
     */
    @Transactional
    public BusinessPayrollRun runPayroll(Long userId, Long businessId, Long employeeId,
                                         BigDecimal grossOverride, BigDecimal hours, Integer periodsPerYear,
                                         LocalDate periodStart, LocalDate periodEnd, LocalDate paidAt) {
        BusinessEmployee emp = employeeRepo.findByIdAndBusinessId(employeeId, businessId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Employee not found"));

        BigDecimal gross;
        if (grossOverride != null && grossOverride.signum() > 0) {
            gross = grossOverride;
        } else if ("HOURLY".equalsIgnoreCase(emp.getPayType())) {
            if (hours == null || hours.signum() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hours are required for an hourly employee");
            }
            gross = nz(emp.getPayRate()).multiply(hours);
        } else {
            int periods = periodsPerYear != null && periodsPerYear > 0 ? periodsPerYear : 26;
            gross = nz(emp.getPayRate()).divide(BigDecimal.valueOf(periods), 2, RoundingMode.HALF_UP);
        }
        gross = gross.setScale(2, RoundingMode.HALF_UP);
        if (gross.signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Gross pay must be greater than zero");
        }

        BigDecimal fed = pct(gross, emp.getFedWhPct());
        BigDecimal state = pct(gross, emp.getStateWhPct());
        BigDecimal fica = pct(gross, emp.getFicaPct());
        BigDecimal net = gross.subtract(fed).subtract(state).subtract(fica).setScale(2, RoundingMode.HALF_UP);
        if (net.signum() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Withholdings exceed gross pay — check the rates");
        }

        BusinessPayrollRun run = new BusinessPayrollRun();
        run.setUserId(userId);
        run.setBusinessId(businessId);
        run.setEmployeeId(employeeId);
        run.setPeriodStart(periodStart);
        run.setPeriodEnd(periodEnd);
        run.setHours(hours);
        run.setGross(gross);
        run.setFedWh(fed);
        run.setStateWh(state);
        run.setFica(fica);
        run.setNet(net);
        run.setStatus("PAID");
        run.setPaidAt(paidAt != null ? paidAt : LocalDate.now());
        BusinessPayrollRun saved = runRepo.save(run);
        saved.setEmployeeName(emp.getName());
        ledgerPosting.postPayrollRun(saved, emp.getName());
        return saved;
    }

    @Transactional(readOnly = true)
    public List<BusinessPayrollRun> listPayrollRuns(Long userId, Long businessId) {
        List<BusinessPayrollRun> runs = runRepo.findByBusinessIdOrderByIdDesc(businessId);
        Map<Long, String> names = new LinkedHashMap<>();
        for (BusinessEmployee e : employeeRepo.findByBusinessIdOrderByNameAsc(businessId)) names.put(e.getId(), e.getName());
        for (BusinessPayrollRun r : runs) r.setEmployeeName(names.get(r.getEmployeeId()));
        return runs;
    }

    private static BigDecimal pct(BigDecimal base, BigDecimal percent) {
        return nz(base).multiply(nz(percent)).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
    }

    private static BigDecimal nz(BigDecimal v) {
        return v == null ? BigDecimal.ZERO : v;
    }
}
