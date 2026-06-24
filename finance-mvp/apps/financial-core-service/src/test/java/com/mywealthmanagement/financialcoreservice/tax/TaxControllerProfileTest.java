package com.mywealthmanagement.financialcoreservice.tax;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Save round-trip for the joint-filing collections: {@code saveProfile} must persist W-2 entries,
 * filers and document metadata in {@code details_json} (so the detailed form repopulates), while the
 * aggregate columns still get the summed figures. Only {@link TaxProfileService} is mocked.
 */
class TaxControllerProfileTest {

    private final TaxProfileService profileService = mock(TaxProfileService.class);
    private final ObjectMapper mapper = new ObjectMapper();
    // saveProfile only needs the profile service + object mapper; the rest are unused here.
    private final TaxController controller = new TaxController(null, profileService, null, null, mapper);

    @AfterEach
    void clearAuth() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void saveProfile_persistsW2sFilersDocumentsInDetailsJson() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("42", null));
        when(profileService.upsert(any(), any())).thenAnswer(inv -> inv.getArgument(1));

        Map<String, Object> body = new HashMap<>();
        body.put("year", 2025);
        body.put("filingStatus", "MARRIED_JOINT");
        body.put("withholding", "0");
        body.put("mortgageInterest", "12840");
        body.put("filers", List.of(
                Map.of("id", "you", "name", "You"),
                Map.of("id", "spouse", "name", "Spouse")));
        body.put("w2s", List.of(
                Map.of("filerId", "you", "employer", "Acme", "wages", 84200, "federalWithholding", 9310),
                Map.of("filerId", "spouse", "employer", "Globex", "wages", 61000, "federalWithholding", 6400)));
        // The frontend sends wages already summed from the W-2 entries.
        body.put("wages", "145200");
        body.put("documents", List.of(
                Map.of("fileName", "w2-acme.pdf", "docType", "W2", "filerId", "you")));

        controller.saveProfile(body);

        ArgumentCaptor<TaxProfile> captor = ArgumentCaptor.forClass(TaxProfile.class);
        verify(profileService).upsert(eq(42L), captor.capture());
        TaxProfile saved = captor.getValue();

        // Aggregate column still gets the summed income.
        assertThat(saved.getGrossIncome()).isEqualByComparingTo("145200");

        // details_json round-trips the scalar field AND the joint-filing collections.
        Map<String, Object> details = mapper.readValue(saved.getDetailsJson(), new TypeReference<>() {});
        assertThat(details).containsKeys("mortgageInterest", "filers", "w2s", "documents");

        List<?> w2s = (List<?>) details.get("w2s");
        assertThat(w2s).hasSize(2);
        @SuppressWarnings("unchecked")
        Map<String, Object> firstW2 = (Map<String, Object>) w2s.get(0);
        assertThat(firstW2).containsEntry("employer", "Acme").containsEntry("filerId", "you");

        assertThat((List<?>) details.get("filers")).hasSize(2);
        assertThat((List<?>) details.get("documents")).hasSize(1);
    }

    @Test
    void saveProfile_withoutCollections_stillWorks() throws Exception {
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken("7", null));
        when(profileService.upsert(any(), any())).thenAnswer(inv -> inv.getArgument(1));

        Map<String, Object> body = new HashMap<>();
        body.put("year", 2025);
        body.put("filingStatus", "SINGLE");
        body.put("wages", "60000");

        controller.saveProfile(body);

        ArgumentCaptor<TaxProfile> captor = ArgumentCaptor.forClass(TaxProfile.class);
        verify(profileService).upsert(eq(7L), captor.capture());
        Map<String, Object> details = mapper.readValue(captor.getValue().getDetailsJson(), new TypeReference<>() {});
        // No w2s/filers/documents keys when none were sent (back-compat).
        assertThat(details).doesNotContainKeys("w2s", "filers", "documents");
        assertThat(details).containsKey("wages");
    }
}
