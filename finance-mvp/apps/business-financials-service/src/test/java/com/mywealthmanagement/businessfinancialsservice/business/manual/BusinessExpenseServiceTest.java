package com.mywealthmanagement.businessfinancialsservice.business.manual;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseSummaryDto;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class BusinessExpenseServiceTest {

    private static final long USER = 1L;
    private static final long BIZ = 7L;

    @Mock private BusinessExpenseRepository expenseRepo;
    @Mock private BusinessExpenseLinkRepository linkRepo;
    @Mock private ManualBusinessRepository businessRepo;

    @InjectMocks private BusinessExpenseService service;

    private void businessOwned() {
        ManualBusiness b = new ManualBusiness();
        b.setId(BIZ);
        b.setUserId(USER);
        b.setName("Acme LLC");
        lenient().when(businessRepo.findByIdAndUserId(BIZ, USER)).thenReturn(Optional.of(b));
    }

    private BusinessExpenseDto standaloneDto(String amount) {
        BusinessExpenseDto dto = new BusinessExpenseDto();
        dto.setExpenseDate(LocalDate.of(2026, 3, 4));
        dto.setCategory("Software & Subscriptions");
        dto.setVendor("Figma");
        dto.setAmount(amount == null ? null : new BigDecimal(amount));
        dto.setSourceMode("STANDALONE");
        return dto;
    }

    private BusinessExpense entity(long id, String mode, String amount, Long receiptId) {
        BusinessExpense e = new BusinessExpense();
        e.setId(id);
        e.setUserId(USER);
        e.setBusinessId(BIZ);
        e.setExpenseDate(LocalDate.of(2026, 3, 4));
        e.setCategory("Software & Subscriptions");
        e.setVendor("Figma");
        e.setSourceMode(mode);
        e.setStatus("RECORDED");
        e.setAmount(amount == null ? null : new BigDecimal(amount));
        e.setReceiptDocumentId(receiptId);
        return e;
    }

    private BusinessExpenseLink link(long id, long expenseId, String amount) {
        BusinessExpenseLink l = new BusinessExpenseLink();
        l.setId(id);
        l.setExpenseId(expenseId);
        l.setUserId(USER);
        l.setTxSource("LINKED");
        l.setTxRef("plaid-" + id);
        l.setTxDate(LocalDate.of(2026, 3, 2));
        l.setTxAmount(new BigDecimal(amount)); // signed as in the ledger
        return l;
    }

    /* ---------------- ownership ---------------- */

    @Test
    void create_deniesBusinessOwnedByAnotherUser() {
        when(businessRepo.findByIdAndUserId(BIZ, USER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.create(USER, BIZ, standaloneDto("50")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Business not found");
        verify(expenseRepo, never()).save(any());
    }

    @Test
    void update_deniesExpenseOwnedByAnotherUser() {
        when(expenseRepo.findByIdAndUserId(99L, USER)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.update(USER, 99L, standaloneDto("50")))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Expense not found");
    }

    /* ---------------- standalone vs linked amounts ---------------- */

    @Test
    void create_standaloneRequiresAmount() {
        businessOwned();

        assertThatThrownBy(() -> service.create(USER, BIZ, standaloneDto(null)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("amount is required");
    }

    @Test
    void create_standaloneUsesItsOwnAmountAsEffective() {
        businessOwned();
        when(expenseRepo.save(any(BusinessExpense.class))).thenAnswer(i -> i.getArgument(0));

        BusinessExpenseDto out = service.create(USER, BIZ, standaloneDto("125.50"));

        assertThat(out.getSourceMode()).isEqualTo("STANDALONE");
        assertThat(out.getEffectiveAmount()).isEqualByComparingTo("125.50");
        assertThat(out.getLinkCount()).isZero();
    }

    @Test
    void create_rejectsUnknownStatus() {
        businessOwned();
        BusinessExpenseDto dto = standaloneDto("10");
        dto.setStatus("BOGUS");

        assertThatThrownBy(() -> service.create(USER, BIZ, dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unknown status");
    }

    @Test
    void addLinks_derivesAmountFromLinkMagnitudesAndSwitchesToLinked() {
        BusinessExpense e = entity(5L, "STANDALONE", "999", null);
        when(expenseRepo.findByIdAndUserId(5L, USER)).thenReturn(Optional.of(e));
        when(linkRepo.findByExpenseIdAndTxSourceAndTxRef(eq(5L), any(), any())).thenReturn(Optional.empty());
        when(expenseRepo.save(any(BusinessExpense.class))).thenAnswer(i -> i.getArgument(0));
        // Ledger amounts are negative for money out; the expense is the magnitude.
        when(linkRepo.findByExpenseIdOrderByTxDateDescIdDesc(5L))
                .thenReturn(List.of(link(1L, 5L, "-1430.00"), link(2L, 5L, "-70.00")));

        BusinessExpenseDto.LinkDto in = new BusinessExpenseDto.LinkDto();
        in.setTxSource("LINKED");
        in.setTxRef("plaid-1");
        in.setTxAmount(new BigDecimal("-1430.00"));

        BusinessExpenseDto out = service.addLinks(USER, 5L, List.of(in));

        assertThat(out.getSourceMode()).isEqualTo("LINKED");
        assertThat(out.getAmount()).isNull();                       // own amount cleared
        assertThat(out.getEffectiveAmount()).isEqualByComparingTo("1500.00"); // 1430 + 70
        assertThat(out.getLinkCount()).isEqualTo(2);
    }

    @Test
    void addLinks_isIdempotentForAnAlreadyLinkedTransaction() {
        BusinessExpense e = entity(5L, "LINKED", null, null);
        when(expenseRepo.findByIdAndUserId(5L, USER)).thenReturn(Optional.of(e));
        when(linkRepo.findByExpenseIdAndTxSourceAndTxRef(5L, "LINKED", "plaid-1"))
                .thenReturn(Optional.of(link(1L, 5L, "-10.00")));   // already attached
        when(expenseRepo.save(any(BusinessExpense.class))).thenAnswer(i -> i.getArgument(0));
        when(linkRepo.findByExpenseIdOrderByTxDateDescIdDesc(5L)).thenReturn(List.of(link(1L, 5L, "-10.00")));

        BusinessExpenseDto.LinkDto in = new BusinessExpenseDto.LinkDto();
        in.setTxSource("LINKED");
        in.setTxRef("plaid-1");

        service.addLinks(USER, 5L, List.of(in));

        verify(linkRepo, never()).save(any(BusinessExpenseLink.class)); // no duplicate row
    }

    @Test
    void addLinks_rejectsUnknownSource() {
        BusinessExpense e = entity(5L, "STANDALONE", "10", null);
        when(expenseRepo.findByIdAndUserId(5L, USER)).thenReturn(Optional.of(e));

        BusinessExpenseDto.LinkDto in = new BusinessExpenseDto.LinkDto();
        in.setTxSource("QUICKBOOKS");
        in.setTxRef("x");

        assertThatThrownBy(() -> service.addLinks(USER, 5L, List.of(in)))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("txSource must be MANUAL or LINKED");
    }

    @Test
    void removeLink_lastLinkRevertsExpenseToStandalone() {
        BusinessExpense e = entity(5L, "LINKED", null, null);
        when(expenseRepo.findByIdAndUserId(5L, USER)).thenReturn(Optional.of(e));
        when(linkRepo.findByIdAndUserId(1L, USER)).thenReturn(Optional.of(link(1L, 5L, "-10.00")));
        when(linkRepo.findByExpenseIdOrderByTxDateDescIdDesc(5L)).thenReturn(List.of()); // none left
        when(expenseRepo.save(any(BusinessExpense.class))).thenAnswer(i -> i.getArgument(0));

        BusinessExpenseDto out = service.removeLink(USER, 5L, 1L);

        assertThat(out.getSourceMode()).isEqualTo("STANDALONE");
        assertThat(out.getEffectiveAmount()).isEqualByComparingTo("0");
        verify(linkRepo, times(1)).delete(any(BusinessExpenseLink.class));
    }

    /* ---------------- summary ---------------- */

    @Test
    void summary_keepsStandaloneAndLinkedTotalsSeparate() {
        businessOwned();
        BusinessExpense standalone = entity(1L, "STANDALONE", "200.00", 55L); // has receipt
        BusinessExpense linked = entity(2L, "LINKED", null, null);            // no receipt
        when(expenseRepo.findByUserIdAndBusinessIdOrderByExpenseDateDescIdDesc(USER, BIZ))
                .thenReturn(List.of(standalone, linked));
        when(linkRepo.findByExpenseIdIn(any())).thenReturn(List.of(link(9L, 2L, "-300.00")));

        ExpenseSummaryDto s = service.summary(USER, BIZ, null, null);

        // The linked 300 documents ledger spend and must NOT be conflated with new spend.
        assertThat(s.getStandaloneTotal()).isEqualByComparingTo("200.00");
        assertThat(s.getLinkedTotal()).isEqualByComparingTo("300.00");
        assertThat(s.getTotal()).isEqualByComparingTo("500.00");
        assertThat(s.getCount()).isEqualTo(2);
        assertThat(s.getMissingReceiptCount()).isEqualTo(1);
    }

    @Test
    void summary_bucketsByCategoryAndMonth() {
        businessOwned();
        BusinessExpense a = entity(1L, "STANDALONE", "200.00", 55L);
        BusinessExpense b = entity(2L, "STANDALONE", "50.00", 56L);
        b.setCategory("Travel");
        b.setExpenseDate(LocalDate.of(2026, 4, 1));
        when(expenseRepo.findByUserIdAndBusinessIdOrderByExpenseDateDescIdDesc(USER, BIZ))
                .thenReturn(List.of(a, b));
        when(linkRepo.findByExpenseIdIn(any())).thenReturn(List.of());

        ExpenseSummaryDto s = service.summary(USER, BIZ, null, null);

        assertThat(s.getByCategory()).extracting(ExpenseSummaryDto.Bucket::getLabel)
                .containsExactly("Software & Subscriptions", "Travel"); // desc by total
        assertThat(s.getByMonth()).extracting(ExpenseSummaryDto.Bucket::getLabel)
                .containsExactly("2026-03", "2026-04");                 // chronological
    }
}
