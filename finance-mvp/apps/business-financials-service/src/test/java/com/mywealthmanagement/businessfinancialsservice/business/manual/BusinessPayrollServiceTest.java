package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessPayrollServiceTest {

    @Mock private BusinessContractorRepository contractorRepo;
    @Mock private BusinessContractorPaymentRepository paymentRepo;
    @Mock private BusinessEmployeeRepository employeeRepo;
    @Mock private BusinessPayrollRunRepository runRepo;
    @Mock private LedgerPostingService ledgerPosting;

    @InjectMocks private BusinessPayrollService service;

    @Test
    void addContractor_appliesDefaults_andPostsNothing() {
        BusinessContractor contractor = new BusinessContractor();
        contractor.setName("Jane Doe");
        contractor.setAmount(new BigDecimal("3500.00"));
        when(contractorRepo.save(any(BusinessContractor.class))).thenAnswer(inv -> inv.getArgument(0));

        BusinessContractor saved = service.addContractor(1L, 2L, contractor);

        assertThat(saved.getTaxForm()).isEqualTo("1099");
        assertThat(saved.getStatus()).isEqualTo("ACTIVE");
        assertThat(saved.getBusinessId()).isEqualTo(2L);
        // Creating a contractor is not an economic event — no phantom ledger entry.
        verify(ledgerPosting, never()).postContractorPayment(any(), anyString());
    }

    @Test
    void payContractor_savesPayment_andPostsExpense() {
        BusinessContractor c = new BusinessContractor();
        c.setId(9L); c.setName("Jane Doe");
        when(contractorRepo.findByIdAndBusinessId(9L, 2L)).thenReturn(Optional.of(c));
        when(paymentRepo.save(any(BusinessContractorPayment.class))).thenAnswer(inv -> inv.getArgument(0));

        BusinessContractorPayment p = service.payContractor(1L, 2L, 9L,
                new BigDecimal("1200.00"), LocalDate.of(2026, 3, 1), "ACH", "ref-1");

        assertThat(p.getAmount()).isEqualByComparingTo("1200.00");
        assertThat(p.getContractorId()).isEqualTo(9L);
        verify(ledgerPosting).postContractorPayment(any(BusinessContractorPayment.class), anyString());
    }

    @Test
    void payContractor_rejectsNonPositiveAmount() {
        BusinessContractor c = new BusinessContractor();
        c.setId(9L); c.setName("Jane Doe");
        when(contractorRepo.findByIdAndBusinessId(9L, 2L)).thenReturn(Optional.of(c));

        assertThatThrownBy(() -> service.payContractor(1L, 2L, 9L, new BigDecimal("0"), null, null, null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        verify(paymentRepo, never()).save(any());
    }

    @Test
    void report1099_flagsContractorsOverThreshold() {
        BusinessContractor a = new BusinessContractor(); a.setId(1L); a.setName("Over"); a.setTaxForm("1099");
        BusinessContractor b = new BusinessContractor(); b.setId(2L); b.setName("Under"); b.setTaxForm("1099");
        when(contractorRepo.findByBusinessIdOrderByNameAsc(2L)).thenReturn(List.of(a, b));
        BusinessContractorPayment p1 = payment(1L, "700.00");
        BusinessContractorPayment p2 = payment(2L, "100.00");
        when(paymentRepo.findByBusinessIdAndPaidAtBetween(eqL(2L), any(), any())).thenReturn(List.of(p1, p2));

        Map<String, Object> report = service.report1099(1L, 2L, 2026);

        assertThat(report.get("reportableCount")).isEqualTo(1L);
        assertThat(report.get("grandTotal")).isEqualTo(new BigDecimal("800.00"));
    }

    @Test
    void runPayroll_salary_computesWithholdingsAndNet_andPosts() {
        BusinessEmployee emp = new BusinessEmployee();
        emp.setId(5L); emp.setName("Sam"); emp.setPayType("SALARY");
        emp.setPayRate(new BigDecimal("52000")); // /26 = 2000 gross
        emp.setFedWhPct(new BigDecimal("10"));
        emp.setStateWhPct(new BigDecimal("5"));
        emp.setFicaPct(new BigDecimal("7.65"));
        when(employeeRepo.findByIdAndBusinessId(5L, 2L)).thenReturn(Optional.of(emp));
        when(runRepo.save(any(BusinessPayrollRun.class))).thenAnswer(inv -> {
            BusinessPayrollRun r = inv.getArgument(0);
            r.setId(300L);
            return r;
        });

        BusinessPayrollRun run = service.runPayroll(1L, 2L, 5L, null, null, 26, null, null, null);

        assertThat(run.getGross()).isEqualByComparingTo("2000.00");
        assertThat(run.getFedWh()).isEqualByComparingTo("200.00");
        assertThat(run.getStateWh()).isEqualByComparingTo("100.00");
        assertThat(run.getFica()).isEqualByComparingTo("153.00");
        assertThat(run.getNet()).isEqualByComparingTo("1547.00");
        ArgumentCaptor<BusinessPayrollRun> rc = ArgumentCaptor.forClass(BusinessPayrollRun.class);
        verify(ledgerPosting).postPayrollRun(rc.capture(), anyString());
    }

    @Test
    void runPayroll_hourly_requiresHours() {
        BusinessEmployee emp = new BusinessEmployee();
        emp.setId(5L); emp.setName("Sam"); emp.setPayType("HOURLY"); emp.setPayRate(new BigDecimal("25"));
        when(employeeRepo.findByIdAndBusinessId(5L, 2L)).thenReturn(Optional.of(emp));

        assertThatThrownBy(() -> service.runPayroll(1L, 2L, 5L, null, null, null, null, null, null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("Hours");
    }

    private static BusinessContractorPayment payment(Long contractorId, String amount) {
        BusinessContractorPayment p = new BusinessContractorPayment();
        p.setContractorId(contractorId);
        p.setAmount(new BigDecimal(amount));
        p.setPaidAt(LocalDate.of(2026, 6, 1));
        return p;
    }

    private static Long eqL(Long v) {
        return org.mockito.ArgumentMatchers.eq(v);
    }
}
