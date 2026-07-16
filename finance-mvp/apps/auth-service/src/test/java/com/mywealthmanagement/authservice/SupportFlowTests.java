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

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

import static org.hamcrest.Matchers.not;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * End-to-end customer-care flow against the real security chain (H2 dev profile):
 * ops login (password → MFA → typ=ops token) → ops-gated support access → 360 view.
 *
 * The load-bearing assertions here are the two directions of the ops/member boundary
 * ({@code opsTokenIsRefusedOnMemberRoutes} and {@code memberTokenIsRefusedOnOpsRoutes}). Because
 * the JWT secret is shared platform-wide, those are the checks standing between "separate ops
 * identity" and a token that quietly works everywhere.
 */
// mfa.enabled=false covers the MEMBER login only — ops MFA is deliberately not switchable off,
// so the ops flow below goes through the real two-step exchange and reads the dev OTP code.
@SpringBootTest(properties = {"mfa.enabled=false", "ops.otp.expose-dev-code=true"})
@AutoConfigureMockMvc
class SupportFlowTests {

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

        // An ops agent is NOT a row in `users` — that is the whole point of the separation.
        OpsUser agent = new OpsUser();
        agent.setEmail("agent@terravest.internal");
        agent.setPasswordHash(encoder.encode("Password123!"));
        agent.setName("Care Agent");
        // Role KEYS, not the enum: roles are DB-editable (seeded by V9), so an ops user holds
        // whatever keys exist rather than a fixed set of enum constants.
        agent.setRoles(new LinkedHashSet<>(List.of(OpsRole.OPS_AGENT.name())));
        opsUsers.save(agent);

        User alice = new User("alice@example.com", encoder.encode("Password123!"),
                new LinkedHashSet<>(List.of(Role.USER)));
        alice.setName("Alice Member");
        alice.setAccountType("INDIVIDUAL");
        alice.setIdentityVerified(true);
        aliceId = users.save(alice).getId();
    }

    /** Member login (MFA disabled for this test) → token. */
    private String memberLogin(String email, String pw) throws Exception {
        String body = om.writeValueAsString(Map.of("email", email, "password", pw));
        String resp = mvc.perform(post("/api/v1/auth/login").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readTree(resp).get("token").asText();
    }

    /** The full two-step ops login: password never returns a token, only an MFA challenge. */
    private String opsLogin(String email, String pw) throws Exception {
        String body = om.writeValueAsString(Map.of("email", email, "password", pw));
        String step1 = mvc.perform(post("/api/v1/ops/auth/login").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.mfaRequired").value(true))
                .andExpect(jsonPath("$.token").doesNotExist())
                .andReturn().getResponse().getContentAsString();
        String code = om.readTree(step1).get("devCode").asText();

        String verify = om.writeValueAsString(Map.of("email", email, "code", code));
        String step2 = mvc.perform(post("/api/v1/ops/auth/mfa/verify").contentType(APPLICATION_JSON).content(verify))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readTree(step2).get("token").asText();
    }

    @Test
    void opsAgentSeesUsersWhileNormalUserIsBlocked() throws Exception {
        String ops = opsLogin("agent@terravest.internal", "Password123!");
        String alice = memberLogin("alice@example.com", "Password123!");

        // 1) Ops agent can search members
        mvc.perform(get("/api/v1/support/users").param("query", "alice")
                        .header("Authorization", "Bearer " + ops))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].email").value("alice@example.com"));

        // 2) Ops agent can open the 360 view (profile + activity sections)
        mvc.perform(get("/api/v1/support/users/" + aliceId)
                        .header("Authorization", "Bearer " + ops))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("alice@example.com"))
                .andExpect(jsonPath("$.identityVerified").value(true))
                .andExpect(jsonPath("$.recentActivity").isArray())
                .andExpect(jsonPath("$.issues").isArray());

        // 3) A normal member is forbidden from the support API
        mvc.perform(get("/api/v1/support/users")
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isForbidden());

        // 4) Unauthenticated is forbidden
        mvc.perform(get("/api/v1/support/users"))
                .andExpect(status().isForbidden());
    }

    /**
     * The reverse guard: an ops token must NOT act as a member. Without this the shared JWT secret
     * would let an agent's token read and write member data as whatever id its subject happens to
     * collide with.
     */
    @Test
    void opsTokenIsRefusedOnMemberRoutes() throws Exception {
        String ops = opsLogin("agent@terravest.internal", "Password123!");

        mvc.perform(get("/api/v1/auth/me").header("Authorization", "Bearer " + ops))
                .andExpect(status().isForbidden());
    }

    /** A member token is refused on the ops surface even before any role check runs. */
    @Test
    void memberTokenIsRefusedOnOpsRoutes() throws Exception {
        String alice = memberLogin("alice@example.com", "Password123!");

        mvc.perform(get("/api/v1/ops/auth/me").header("Authorization", "Bearer " + alice))
                .andExpect(status().isForbidden());
    }

    /** An ops agent reads their own audited trail via the ops route, keyed by their ops_users id. */
    @Test
    void opsAgentCanReadOwnSession() throws Exception {
        String ops = opsLogin("agent@terravest.internal", "Password123!");

        mvc.perform(get("/api/v1/ops/auth/me").header("Authorization", "Bearer " + ops))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("agent@terravest.internal"))
                .andExpect(jsonPath("$.roles[0]").value("OPS_AGENT"));
    }

    /** Wrong password reveals nothing about whether the account exists. */
    @Test
    void opsLoginRejectsBadCredentialsUniformly() throws Exception {
        String wrongPw = om.writeValueAsString(
                Map.of("email", "agent@terravest.internal", "password", "nope"));
        mvc.perform(post("/api/v1/ops/auth/login").contentType(APPLICATION_JSON).content(wrongPw))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid credentials"));

        String unknown = om.writeValueAsString(
                Map.of("email", "ghost@terravest.internal", "password", "Password123!"));
        mvc.perform(post("/api/v1/ops/auth/login").contentType(APPLICATION_JSON).content(unknown))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid credentials"));
    }

    /**
     * A customer can no longer be granted staff access — the promotion endpoint is gone.
     *
     * Asserts the outcome (no handler ran, no role was granted) rather than a specific status:
     * this service maps an unmapped path to 500 rather than 404, because Boot 3.2 throws
     * NoHandlerFoundException and GlobalExceptionHandler's catch-all swallows it. That is
     * pre-existing behaviour for every unknown path here, and not this test's subject.
     */
    @Test
    void customerRoleGrantEndpointNoLongerExists() throws Exception {
        String ops = opsLogin("agent@terravest.internal", "Password123!");
        String grant = om.writeValueAsString(Map.of("role", "CARE", "action", "GRANT"));

        mvc.perform(post("/api/v1/support/users/" + aliceId + "/roles")
                        .contentType(APPLICATION_JSON).content(grant)
                        .header("Authorization", "Bearer " + ops))
                .andExpect(status().is(not(200)));

        // The thing that actually matters: Alice is still just a member.
        org.junit.jupiter.api.Assertions.assertEquals(
                List.of(Role.USER), List.copyOf(users.findById(aliceId).orElseThrow().getRoles()),
                "no staff role may be granted onto a customer row");
    }
}
