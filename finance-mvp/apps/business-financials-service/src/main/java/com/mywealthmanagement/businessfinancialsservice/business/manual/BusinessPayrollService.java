package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Service
@RequiredArgsConstructor
public class BusinessPayrollService {

    private final BusinessContractorRepository contractorRepo;
    private final LedgerService ledgerService;

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
        BusinessContractor saved = contractorRepo.save(contractor);
        if (saved.getAmount() != null && saved.getAmount().signum() > 0) {
            BigDecimal amount = saved.getAmount();
            ledgerService.post(businessId, userId, LocalDate.now(), "Contractor setup - " + saved.getName(),
                    "CONTRACTOR", String.valueOf(saved.getId()), List.of(
                            new LedgerService.LineInput("6100", amount, null, "Payroll expense"),
                            new LedgerService.LineInput("2300", null, amount, "Payroll liability")));
        }
        return saved;
    }

    @Transactional
    public BusinessContractor updateContractor(Long userId, Long businessId, Long id, BusinessContractor updates) {
        BusinessContractor contractor = contractorRepo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Contractor not found"));
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
    public java.util.List<BusinessContractor> listContractors(Long userId, Long businessId) {
        return contractorRepo.findByBusinessIdOrderByNameAsc(businessId);
    }

    @Transactional
    public void deleteContractor(Long userId, Long businessId, Long id) {
        BusinessContractor contractor = contractorRepo.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND, "Contractor not found"));
        contractorRepo.delete(contractor);
    }
}
