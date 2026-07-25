package com.mywealthmanagement.realestateservice.property;

import com.mywealthmanagement.realestateservice.property.dto.PropertyDocumentDto;
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

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class PropertyDocumentServiceTest {

    @Mock
    private PropertyDocumentRepository documentRepository;

    @Mock
    private PropertyExpenseRepository expenseRepository;

    @Mock
    private PropertyRepository propertyRepository;

    @InjectMocks
    private PropertyDocumentService service;

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
        return p;
    }

    private PropertyDocumentDto validDto() {
        PropertyDocumentDto dto = new PropertyDocumentDto();
        dto.setDocumentId(4001L);
        dto.setDocumentName("2026 1098 — 123 Maple St");
        dto.setDocType("FORM_1098");
        return dto;
    }

    @Test
    void create_savesPropertyLevelLink() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        when(documentRepository.save(any(PropertyDocument.class))).thenAnswer(inv -> inv.getArgument(0));

        PropertyDocumentDto created = service.create(7L, validDto());

        assertThat(created.getDocumentId()).isEqualTo(4001L);
        assertThat(created.getExpenseId()).isNull(); // property-level
        assertThat(created.getDocType()).isEqualTo("FORM_1098");
    }

    @Test
    void create_attachesReceiptToOwnedExpense() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        PropertyExpense e = new PropertyExpense();
        e.setId(55L);
        e.setPropertyId(7L);
        e.setUserId(1L);
        lenient().when(expenseRepository.findById(55L)).thenReturn(Optional.of(e));
        when(documentRepository.save(any(PropertyDocument.class))).thenAnswer(inv -> inv.getArgument(0));

        PropertyDocumentDto dto = validDto();
        dto.setExpenseId(55L);
        dto.setDocType("RECEIPT");

        PropertyDocumentDto created = service.create(7L, dto);
        assertThat(created.getExpenseId()).isEqualTo(55L);
    }

    @Test
    void create_rejectsReceiptForExpenseOnAnotherProperty() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        PropertyExpense e = new PropertyExpense();
        e.setId(55L);
        e.setPropertyId(99L); // belongs to a different property
        e.setUserId(1L);
        lenient().when(expenseRepository.findById(55L)).thenReturn(Optional.of(e));

        PropertyDocumentDto dto = validDto();
        dto.setExpenseId(55L);

        assertThatThrownBy(() -> service.create(7L, dto))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Expense not found");
    }

    @Test
    void create_deniesPropertyOwnedByAnotherUser() {
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        authenticateAs("2"); // different user -> 404, no existence leak

        assertThatThrownBy(() -> service.create(7L, validDto()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Property not found");
    }

    @Test
    void delete_deniesLinkFromAnotherProperty() {
        authenticateAs("1");
        lenient().when(propertyRepository.findById(7L)).thenReturn(Optional.of(propertyOwnedBy(1L)));
        PropertyDocument d = new PropertyDocument();
        d.setId(3L);
        d.setPropertyId(99L); // belongs to a different property
        d.setUserId(1L);
        lenient().when(documentRepository.findById(3L)).thenReturn(Optional.of(d));

        assertThatThrownBy(() -> service.delete(7L, 3L))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Document not found");
    }
}
