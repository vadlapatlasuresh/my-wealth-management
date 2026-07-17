package com.mywealthmanagement.authservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mywealthmanagement.authservice.ops.OpsRole;
import com.mywealthmanagement.authservice.ops.OpsUser;
import com.mywealthmanagement.authservice.ops.OpsUserRepository;
import com.mywealthmanagement.authservice.user.Role;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.time.LocalDate;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Caller verification and the disclosure gate.
 *
 * The load-bearing test is {@link #piiRevealIsBlockedUntilTheCallerIsVerified}: it proves the gate
 * sits IN FRONT of the permission. An agent who fully holds customer.pii.reveal still cannot read
 * PII to a caller who hasn't proven who they are — which is the entire point of the feature.
 */
@SpringBootTest(properties = {"mfa.enabled=false", "ops.otp.expose-dev-code=true"})
@AutoConfigureMockMvc
class CallerVerificationTests {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired OpsUserRepository opsUsers;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper om;

    private Long aliceId;

    @BeforeEach
    void seed() {
        users.deleteAll();
        opsUsers.deleteAll();

        // A supervisor — holds customer.pii.reveal, so the ONLY thing that can stop a reveal here
        // is the caller's verification tier.
        OpsUser sup = new OpsUser();
        sup.setEmail("sup@terravest.internal");
        sup.setPasswordHash(encoder.encode("Password123!"));
        sup.setName("Supervisor");
        sup.setRoles(new LinkedHashSet<>(List.of(OpsRole.OPS_SUPERVISOR.name())));
        opsUsers.save(sup);

        User alice = new User("alice@example.com", encoder.encode("Password123!"),
                new LinkedHashSet<>(List.of(Role.USER)));
        alice.setName("Alice Member");
        alice.setSsnLast4("4417");
        alice.setDateOfBirth(LocalDate.of(1990, 5, 20));
        alice.setPostalCode("78701");
        aliceId = users.save(alice).getId();
    }

    private String login(String email) throws Exception {
        String body = om.writeValueAsString(Map.of("email", email, "password", "Password123!"));
        String s1 = mvc.perform(post("/api/v1/ops/auth/login").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String code = om.readTree(s1).get("devCode").asText();
        String verify = om.writeValueAsString(Map.of("email", email, "code", code));
        String s2 = mvc.perform(post("/api/v1/ops/auth/mfa/verify").contentType(APPLICATION_JSON).content(verify))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return om.readTree(s2).get("token").asText();
    }

    private String bearer(String token) { return "Bearer " + token; }

    /** THE test: permission is not enough — the caller must be verified. */
    @Test
    void piiRevealIsBlockedUntilTheCallerIsVerified() throws Exception {
        String sup = login("sup@terravest.internal");

        // Open the record — starts a Tier-0 session.
        mvc.perform(get("/api/v1/ops/verify/" + aliceId).header("Authorization", bearer(sup)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value(0));

        // Reveal now: the agent HAS the permission, but the caller is unverified -> 403.
        mvc.perform(get("/api/v1/support/users/" + aliceId + "/pii")
                        .param("reason", "caller wants to confirm their tax id")
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isForbidden());

        // Verify the caller by OTP (to Tier 2).
        MvcResult sent = mvc.perform(post("/api/v1/ops/verify/" + aliceId + "/otp/send")
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.devCode").exists())
                .andReturn();
        String code = om.readTree(sent.getResponse().getContentAsString()).get("devCode").asText();

        mvc.perform(post("/api/v1/ops/verify/" + aliceId + "/otp/confirm")
                        .contentType(APPLICATION_JSON).content(om.writeValueAsString(Map.of("code", code)))
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value(2));

        // Now the same reveal succeeds.
        mvc.perform(get("/api/v1/support/users/" + aliceId + "/pii")
                        .param("reason", "caller wants to confirm their tax id")
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ssnLast4").value("4417"));
    }

    /** A wrong OTP does not raise the tier. */
    @Test
    void aWrongOtpDoesNotVerify() throws Exception {
        String sup = login("sup@terravest.internal");
        mvc.perform(post("/api/v1/ops/verify/" + aliceId + "/otp/send").header("Authorization", bearer(sup)))
                .andExpect(status().isOk());

        mvc.perform(post("/api/v1/ops/verify/" + aliceId + "/otp/confirm")
                        .contentType(APPLICATION_JSON).content(om.writeValueAsString(Map.of("code", "000000")))
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isUnauthorized());

        mvc.perform(get("/api/v1/ops/verify/" + aliceId).header("Authorization", bearer(sup)))
                .andExpect(jsonPath("$.tier").value(0));
    }

    /** KBA grants Tier 1 — enough for status, NOT enough for PII (which needs T2). */
    @Test
    void kbaGrantsTier1WhichIsNotEnoughForPii() throws Exception {
        String sup = login("sup@terravest.internal");

        MvcResult kba = mvc.perform(get("/api/v1/ops/verify/" + aliceId + "/kba")
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.factKey").exists())
                .andReturn();
        String factKey = om.readTree(kba.getResponse().getContentAsString()).get("factKey").asText();

        mvc.perform(post("/api/v1/ops/verify/" + aliceId + "/kba/confirm")
                        .contentType(APPLICATION_JSON)
                        .content(om.writeValueAsString(Map.of("factKey", factKey, "passed", true)))
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value(1));

        // T1 < T2 -> PII still blocked.
        mvc.perform(get("/api/v1/support/users/" + aliceId + "/pii")
                        .param("reason", "caller wants to confirm their tax id")
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isForbidden());
    }

    /** KBA never offers SSN as the fact — that would leak PII to an agent past the permission gate. */
    @Test
    void kbaNeverAsksForSsn() throws Exception {
        String sup = login("sup@terravest.internal");
        for (int i = 0; i < 20; i++) {
            MvcResult r = mvc.perform(get("/api/v1/ops/verify/" + aliceId + "/kba")
                            .header("Authorization", bearer(sup)))
                    .andExpect(status().isOk()).andReturn();
            String factKey = om.readTree(r.getResponse().getContentAsString()).get("factKey").asText();
            org.junit.jupiter.api.Assertions.assertNotEquals("ssn_last4", factKey,
                    "SSN must never be offered as a KBA fact — the agent sees the expected answer");
        }
    }

    /** Flagging suspicious freezes the session; verification can't then be raised this call. */
    @Test
    void suspiciousFlagFreezesDisclosure() throws Exception {
        String sup = login("sup@terravest.internal");
        mvc.perform(post("/api/v1/ops/verify/" + aliceId + "/suspicious")
                        .contentType(APPLICATION_JSON).content(om.writeValueAsString(Map.of("note", "voice didn't match")))
                        .header("Authorization", bearer(sup)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.tier").value(0))
                .andExpect(jsonPath("$.frozen").value(true));

        // Even a correct OTP can't lift a frozen session.
        mvc.perform(post("/api/v1/ops/verify/" + aliceId + "/otp/send").header("Authorization", bearer(sup)))
                .andExpect(status().isConflict());
    }
}
