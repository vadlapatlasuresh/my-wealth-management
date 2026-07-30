package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.ledger.LedgerPostingService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessInventoryServiceTest {

    @Mock private BusinessInventoryItemRepository repo;
    @Mock private BusinessInventoryMovementRepository movementRepo;
    @Mock private LedgerPostingService ledgerPosting;

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
    void adjustStock_updatesOnHand_recordsMovement_andPosts() {
        BusinessInventoryItem item = new BusinessInventoryItem();
        item.setId(77L);
        item.setOnHand(10);
        item.setCostPrice(new BigDecimal("12.50"));
        when(repo.findByIdAndBusinessId(77L, 2L)).thenReturn(Optional.of(item));
        when(repo.save(any(BusinessInventoryItem.class))).thenAnswer(inv -> inv.getArgument(0));
        when(movementRepo.save(any(BusinessInventoryMovement.class))).thenAnswer(inv -> {
            BusinessInventoryMovement m = inv.getArgument(0);
            m.setId(500L);
            return m;
        });

        BusinessInventoryItem updated = service.adjustStock(1L, 2L, 77L, 3, "RECEIVE", "restock");

        assertThat(updated.getOnHand()).isEqualTo(13);
        ArgumentCaptor<BusinessInventoryMovement> mc = ArgumentCaptor.forClass(BusinessInventoryMovement.class);
        verify(movementRepo).save(mc.capture());
        assertThat(mc.getValue().getKind()).isEqualTo("RECEIVE");
        assertThat(mc.getValue().getDelta()).isEqualTo(3);
        verify(ledgerPosting).postInventoryMovement(any(BusinessInventoryMovement.class), any(BusinessInventoryItem.class));
    }

    @Test
    void adjustStock_rejectsZeroDelta() {
        assertThatThrownBy(() -> service.adjustStock(1L, 2L, 77L, 0, null, null))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class)
                .hasMessageContaining("non-zero");
        verify(repo, never()).save(any(BusinessInventoryItem.class));
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
    void lowStock_returnsItemsAtOrBelowReorderPoint() {
        BusinessInventoryItem low = new BusinessInventoryItem();
        low.setName("Low"); low.setOnHand(2); low.setReorderPoint(5);
        BusinessInventoryItem ok = new BusinessInventoryItem();
        ok.setName("Ok"); ok.setOnHand(20); ok.setReorderPoint(5);
        BusinessInventoryItem untracked = new BusinessInventoryItem();
        untracked.setName("Untracked"); untracked.setOnHand(0); untracked.setReorderPoint(null);
        when(repo.findByBusinessIdOrderByNameAsc(2L)).thenReturn(List.of(low, ok, untracked));

        List<BusinessInventoryItem> result = service.lowStock(1L, 2L);

        assertThat(result).containsExactly(low);
    }
}
