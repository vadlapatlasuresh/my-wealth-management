package com.mywealthmanagement.businessfinancialsservice.business.manual;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessInventoryServiceTest {

    @Mock private BusinessInventoryItemRepository repo;
    @Mock private com.mywealthmanagement.businessfinancialsservice.ledger.LedgerService ledgerService;

    @InjectMocks private BusinessInventoryService service;

    @Test
    void create_setsDefaultsAndSaves() {
        BusinessInventoryItem item = new BusinessInventoryItem();
        item.setName("Widget");
        item.setSku("W-100");
        item.setCostPrice(new BigDecimal("12.50"));
        item.setSellPrice(new BigDecimal("19.99"));
        item.setOnHand(5);
        when(repo.save(any(BusinessInventoryItem.class))).thenAnswer(inv -> inv.getArgument(0));

        BusinessInventoryItem saved = service.create(1L, 2L, item);

        assertThat(saved.getStatus()).isEqualTo("ACTIVE");
        assertThat(saved.getOnHand()).isEqualTo(5);
        assertThat(saved.getBusinessId()).isEqualTo(2L);
        assertThat(saved.getUserId()).isEqualTo(1L);
        verify(repo).save(any(BusinessInventoryItem.class));
    }

    @Test
    void adjustStock_updatesOnHand() {
        BusinessInventoryItem item = new BusinessInventoryItem();
        item.setId(77L);
        item.setOnHand(10);
        when(repo.findByIdAndBusinessId(77L, 2L)).thenReturn(Optional.of(item));
        when(repo.save(any(BusinessInventoryItem.class))).thenAnswer(inv -> inv.getArgument(0));

        BusinessInventoryItem updated = service.adjustStock(1L, 2L, 77L, 3);

        assertThat(updated.getOnHand()).isEqualTo(13);
        verify(repo).save(item);
    }

    @Test
    void adjustStock_rejectsNegativeOnHand() {
        BusinessInventoryItem item = new BusinessInventoryItem();
        item.setId(77L);
        item.setOnHand(1);
        when(repo.findByIdAndBusinessId(77L, 2L)).thenReturn(Optional.of(item));

        assertThatThrownBy(() -> service.adjustStock(1L, 2L, 77L, -2))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("on hand");
        verify(repo, never()).save(any(BusinessInventoryItem.class));
    }

    @Test
    void adjustStock_postsLedgerEntryForCostedAdjustment() {
        BusinessInventoryItem item = new BusinessInventoryItem();
        item.setId(77L);
        item.setOnHand(10);
        item.setCostPrice(new BigDecimal("12.50"));
        when(repo.findByIdAndBusinessId(77L, 2L)).thenReturn(Optional.of(item));
        when(repo.save(any(BusinessInventoryItem.class))).thenAnswer(inv -> inv.getArgument(0));

        service.adjustStock(1L, 2L, 77L, -2);

        verify(ledgerService).post(anyLong(), anyLong(), any(LocalDate.class), anyString(), anyString(), anyString(), anyList());
    }
}
