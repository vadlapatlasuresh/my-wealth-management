package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyExpenseDto;
import com.mywealthmanagement.realestateservice.property.dto.PropertyExpenseSummaryDto;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PropertyExpenseServiceTest {

    @Mock
    private PropertyExpenseRepository expenseRepository;

    @Mock
    private PropertyRepository propertyRepository;

    @InjectMocks
    private PropertyExpenseService service;

    private void authenticateAs(String userId) {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId, "Bearer t", AuthorityUtils.NO_AUTHORITIES));
    }

    @AfterEach
    void clear() {
        SecurityContextHolder.clearContext();
    }

    private Property propertyOwnedBy(long ownerId) {
        Property p = new Property();
        p.setId(7L);
        p.setUserId(ownerId);
        p.setAddress("123 Maple St");
        p.setPropertyType("RENTAL_PROPERTY");
        return p;
    }

    private PropertyExpenseDto validDto() {
        PropertyExpenseDto dto = new PropertyExpenseDto();
        dto.setExpenseDate(LocalDate.now());
        dto.setCategory("Repairs");
        dto.setVendor("Ace Hardware");
        dto.setDescription("Faucet");
        dto.setAmount(new BigDecimal("100.00"));
        dto.setPaymentMethod("Credit Card");
        dto.setReceiptRef("RCPT-1");
        return dto;
    }

    @Test
    void create_computesLaborAndTotalCost() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        when(expenseRepository.save(any(PropertyExpense.class))).thenAnswer(inv -> inv.getArgument(0));

        PropertyExpenseDto dto = validDto();
        dto.setAmount(new BigDecimal("50.00"));
        dto.setHours(new BigDecimal("2"));
        dto.setHourlyRate(new BigDecimal("45"));

        PropertyExpenseDto created = service.create(7L, dto);

        assertThat(created.getLaborCost()).isEqualByComparingTo("90.00"); // 2 * 45
        assertThat(created.getTotalCost()).isEqualByComparingTo("140.00"); // 50 + 90
    }

    @Test
    void create_withoutLabor_totalEqualsAmount() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        when(expenseRepository.save(any(PropertyExpense.class))).thenAnswer(inv -> inv.getArgument(0));

        PropertyExpenseDto created = service.create(7L, validDto());

        assertThat(created.getLaborCost()).isNull();
        assertThat(created.getTotalCost()).isEqualByComparingTo("100.00");
    }

    @Test
    void create_rejectsUnknownCategory() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));

        PropertyExpenseDto dto = validDto();
        dto.setCategory("Bribes");

        assertThatThrownBy(() -> service.create(7L, dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unknown expense category");
    }

    @Test
    void create_deniesPropertyOwnedByAnotherUser() {
        // Property owned by user 1.
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));

        authenticateAs("2"); // a different user -> 404, no existence leak
        assertThatThrownBy(() -> service.create(7L, validDto()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Property not found");
    }

    @Test
    void update_deniesExpenseFromAnotherProperty() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        PropertyExpense other = new PropertyExpense();
        other.setId(3L);
        other.setPropertyId(99L); // belongs to a different property
        other.setUserId(1L);
        lenient().when(expenseRepository.findById(3L)).thenReturn(Optional.of(other));

        assertThatThrownBy(() -> service.update(7L, 3L, validDto()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Expense not found");
    }

    @Test
    void summary_aggregatesTotalsMissingReceiptsAndByCategory() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));

        int year = LocalDate.now().getYear();
        PropertyExpense a = expense(year, "Repairs", "210.00", "RCPT-9", null, null);
        PropertyExpense b = expense(year, "Repairs", "40.00", null, "1", "30"); // missing receipt + labor 30
        PropertyExpense c = expense(year, "Utilities", "78.20", "RCPT-3", null, null);
        when(expenseRepository.findByPropertyIdAndExpenseDateBetweenOrderByExpenseDateDescIdDesc(
                eq(7L), any(), any())).thenReturn(List.of(a, b, c));

        PropertyExpenseSummaryDto s = service.summary(7L, year);

        // Repairs: 210 + (40 + 30 labor) = 280 ; Utilities: 78.20 ; grand = 358.20
        assertThat(s.getGrandTotal()).isEqualByComparingTo("358.20");
        assertThat(s.getMissingReceiptCount()).isEqualTo(1);
        assertThat(s.getExpenseCount()).isEqualTo(3);
        assertThat(s.getByCategory().get(0).getCategory()).isEqualTo("Repairs"); // sorted desc
        assertThat(s.getByCategory().get(0).getTotal()).isEqualByComparingTo("280.00");
    }

    private PropertyExpense expense(int year, String category, String amount,
                                    String receipt, String hours, String rate) {
        PropertyExpense e = new PropertyExpense();
        e.setPropertyId(7L);
        e.setUserId(1L);
        e.setExpenseDate(LocalDate.of(year, 1, 15));
        e.setCategory(category);
        e.setAmount(new BigDecimal(amount));
        e.setReceiptRef(receipt);
        if (hours != null) e.setHours(new BigDecimal(hours));
        if (rate != null) e.setHourlyRate(new BigDecimal(rate));
        return e;
    }
}
