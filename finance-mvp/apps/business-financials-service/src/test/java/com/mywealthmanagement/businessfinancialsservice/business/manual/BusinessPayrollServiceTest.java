package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessPayrollServiceTest {

    @Mock private BusinessContractorRepository repo;
    @Mock private com.mywealthmanagement.businessfinancialsservice.ledger.LedgerService ledgerService;

    @InjectMocks private BusinessPayrollService service;

    @Test
    void addContractor_appliesDefaults() {
        BusinessContractor contractor = new BusinessContractor();
        contractor.setName("Jane Doe");
        contractor.setAmount(new BigDecimal("3500.00"));
        when(repo.save(any(BusinessContractor.class))).thenAnswer(inv -> inv.getArgument(0));

        BusinessContractor saved = service.addContractor(1L, 2L, contractor);

        assertThat(saved.getTaxForm()).isEqualTo("1099");
        assertThat(saved.getStatus()).isEqualTo("ACTIVE");
        assertThat(saved.getBusinessId()).isEqualTo(2L);
        verify(repo).save(any(BusinessContractor.class));
    }

    @Test
    void addContractor_postsLedgerEntryWhenAmountIsPresent() {
        BusinessContractor contractor = new BusinessContractor();
        contractor.setName("Jane Doe");
        contractor.setAmount(new BigDecimal("3500.00"));
        when(repo.save(any(BusinessContractor.class))).thenAnswer(inv -> inv.getArgument(0));

        service.addContractor(1L, 2L, contractor);

        verify(ledgerService).post(anyLong(), anyLong(), any(LocalDate.class), anyString(), anyString(), anyString(), anyList());
    }
}
