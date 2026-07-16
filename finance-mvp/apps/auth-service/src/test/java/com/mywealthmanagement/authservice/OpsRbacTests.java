package com.mywealthmanagement.authservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mywealthmanagement.authservice.ops.OpsPermission;
import com.mywealthmanagement.authservice.ops.OpsRole;
import com.mywealthmanagement.authservice.ops.OpsRoleEntity;
import com.mywealthmanagement.authservice.ops.OpsRoleRepository;
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

import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Feature-level access control, against the real security chain (H2 dev profile).
 *
 * The point of these tests is the DIFFERENCE between roles. It is easy to ship an RBAC system
 * where every authenticated ops user passes every check — @PreAuthorize is inert without
 * @EnableMethodSecurity, and nothing else would fail. So each test here pairs an allow with a
 * deny: an agent can open a record but cannot unmask its PII, a supervisor can, and neither can
 * administer ops accounts.
 */
@SpringBootTest(properties = {"mfa.enabled=false", "ops.otp.expose-dev-code=true"})
@AutoConfigureMockMvc
class OpsRbacTests {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired OpsUserRepository opsUsers;
    @Autowired OpsRoleRepository roles;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper om;

    private Long aliceId;

    /**
     * The role→permission matrix is DB state seeded once by Flyway, and one test below retunes it.
     * Restore the seeded agent bundle before each test so results don't depend on test order —
     * a suite where "does an agent hold pii.reveal?" is answered differently depending on what ran
     * first is worse than no suite.
     */
    private void restoreSeededAgentPermissions() {
        OpsRoleEntity agentRole = roles.findById(OpsRole.OPS_AGENT.name()).orElseThrow();
        agentRole.setPermissionKeys(new LinkedHashSet<>(List.of(
                OpsPermission.CUSTOMER_SEARCH.key(),
                OpsPermission.CUSTOMER_VIEW.key(),
                OpsPermission.CUSTOMER_DATA_VIEW.key())));
        roles.save(agentRole);
    }

    @BeforeEach
    void seed() {
        users.deleteAll();
        opsUsers.deleteAll();
        restoreSeededAgentPermissions();
        newOps("agent@terravest.internal", OpsRole.OPS_AGENT);
        newOps("super@terravest.internal", OpsRole.OPS_SUPERVISOR);
        newOps("admin@terravest.internal", OpsRole.OPS_ADMIN);

        User alice = new User("alice@example.com", encoder.encode("Password123!"),
                new LinkedHashSet<>(List.of(Role.USER)));
        alice.setName("Alice Member");
        alice.setSsnLast4("4417");
        aliceId = users.save(alice).getId();
    }

    private void newOps(String email, OpsRole role) {
        OpsUser u = new OpsUser();
        u.setEmail(email);
        u.setPasswordHash(encoder.encode("Password123!"));
        u.setName(email);
        u.setRoles(new LinkedHashSet<>(List.of(role.name())));
        opsUsers.save(u);
    }

    /** Full two-step ops login → token. */
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

    @Test
    void tokenCarriesResolvedPermissionsNotJustRoles() throws Exception {
        String agent = login("agent@terravest.internal");

        mvc.perform(get("/api/v1/ops/auth/me").header("Authorization", "Bearer " + agent))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles[0]").value("OPS_AGENT"))
                // Seeded by V9 — an agent can find and read customers.
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.hasItems(
                        OpsPermission.CUSTOMER_SEARCH.key(),
                        OpsPermission.CUSTOMER_VIEW.key(),
                        OpsPermission.CUSTOMER_DATA_VIEW.key())))
                // ...and nothing more. If these ever appear, the seeded matrix has drifted.
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.hasItem(OpsPermission.CUSTOMER_PII_REVEAL.key()))))
                .andExpect(jsonPath("$.permissions", org.hamcrest.Matchers.not(
                        org.hamcrest.Matchers.hasItem(OpsPermission.OPS_USER_MANAGE.key()))));
    }

    /**
     * The core of feature-level access control: two ops users, both fully authenticated, differing
     * only in what they may do. If @EnableMethodSecurity were ever removed, this is what fails.
     */
    @Test
    void piiRevealIsGatedOnPermissionNotMerelyOnBeingStaff() throws Exception {
        String agent = login("agent@terravest.internal");
        String supervisor = login("super@terravest.internal");

        // Both can open the record...
        mvc.perform(get("/api/v1/support/users/" + aliceId).header("Authorization", "Bearer " + agent))
                .andExpect(status().isOk());
        mvc.perform(get("/api/v1/support/users/" + aliceId).header("Authorization", "Bearer " + supervisor))
                .andExpect(status().isOk());

        // ...but only the supervisor can unmask it.
        mvc.perform(get("/api/v1/support/users/" + aliceId + "/pii")
                        .param("reason", "Caller verifying their tax id on file")
                        .header("Authorization", "Bearer " + agent))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/support/users/" + aliceId + "/pii")
                        .param("reason", "Caller verifying their tax id on file")
                        .header("Authorization", "Bearer " + supervisor))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ssnLast4").value("4417"));
    }

    /** The 360 view must not leak what the reveal endpoint exists to protect. */
    @Test
    void customerRecordNeverCarriesPiiEvenForASupervisor() throws Exception {
        String supervisor = login("super@terravest.internal");

        mvc.perform(get("/api/v1/support/users/" + aliceId).header("Authorization", "Bearer " + supervisor))
                .andExpect(status().isOk())
                // Present on the record, absent from the payload — the reveal is a separate,
                // reason-carrying, audited act.
                .andExpect(jsonPath("$.hasSsn").value(true))
                .andExpect(jsonPath("$.ssnLast4").doesNotExist())
                .andExpect(jsonPath("$.einLast4").doesNotExist());
    }

    /** A reason that explains nothing is the same as no reason. */
    @Test
    void piiRevealRequiresAMeaningfulReason() throws Exception {
        String supervisor = login("super@terravest.internal");

        mvc.perform(get("/api/v1/support/users/" + aliceId + "/pii")
                        .param("reason", "asdf")
                        .header("Authorization", "Bearer " + supervisor))
                .andExpect(status().isBadRequest());
    }

    /** Ops administration is its own permission — a supervisor is not an admin. */
    @Test
    void opsAdministrationIsGatedOnOpsUserManage() throws Exception {
        String supervisor = login("super@terravest.internal");
        String admin = login("admin@terravest.internal");

        mvc.perform(get("/api/v1/ops/admin/users").header("Authorization", "Bearer " + supervisor))
                .andExpect(status().isForbidden());

        mvc.perform(get("/api/v1/ops/admin/users").header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk());
    }

    /** Compliance-style oversight is separate from front-line access. */
    @Test
    void auditQueryIsGatedOnAuditQueryPermission() throws Exception {
        String agent = login("agent@terravest.internal");
        String supervisor = login("super@terravest.internal");

        mvc.perform(get("/api/v1/ops/audit/target/" + aliceId).header("Authorization", "Bearer " + agent))
                .andExpect(status().isForbidden());

        // The supervisor holds audit.query, so they get past authorisation. audit-service isn't
        // running in this slice, so the call then fails as 503 — which is itself the contract:
        // an unavailable trail must never render as "no one accessed this customer".
        mvc.perform(get("/api/v1/ops/audit/target/" + aliceId).header("Authorization", "Bearer " + supervisor))
                .andExpect(status().isServiceUnavailable());
    }

    /** The access matrix is DB-editable, and a retune is visible on the next login. */
    @Test
    void retuningARoleChangesWhatItsHoldersCanDo() throws Exception {
        String admin = login("admin@terravest.internal");

        // Grant agents PII reveal.
        String body = om.writeValueAsString(Map.of("permissions", List.of(
                OpsPermission.CUSTOMER_SEARCH.key(), OpsPermission.CUSTOMER_VIEW.key(),
                OpsPermission.CUSTOMER_DATA_VIEW.key(), OpsPermission.CUSTOMER_PII_REVEAL.key())));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/ops/admin/roles/OPS_AGENT/permissions")
                        .contentType(APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isOk());

        // A token minted AFTER the change carries it.
        String agent = login("agent@terravest.internal");
        mvc.perform(get("/api/v1/support/users/" + aliceId + "/pii")
                        .param("reason", "Caller verifying their tax id on file")
                        .header("Authorization", "Bearer " + agent))
                .andExpect(status().isOk());
    }

    /** Permission keys are code; a role can't be built from one no endpoint checks. */
    @Test
    void unknownPermissionKeysAreRejected() throws Exception {
        String admin = login("admin@terravest.internal");
        String body = om.writeValueAsString(Map.of("permissions", List.of("customer.view", "totally.made.up")));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/ops/admin/roles/OPS_AGENT/permissions")
                        .contentType(APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isBadRequest());
    }

    /**
     * Removing the last grant of ops.user.manage would lock everyone out of role administration
     * permanently, with no way back in short of a DB edit.
     */
    @Test
    void refusesToStripTheLastGrantOfOpsUserManage() throws Exception {
        String admin = login("admin@terravest.internal");
        String body = om.writeValueAsString(Map.of("permissions", List.of(OpsPermission.CUSTOMER_VIEW.key())));

        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .put("/api/v1/ops/admin/roles/OPS_ADMIN/permissions")
                        .contentType(APPLICATION_JSON).content(body)
                        .header("Authorization", "Bearer " + admin))
                .andExpect(status().isConflict());
    }
}
