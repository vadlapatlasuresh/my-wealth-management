package com.mywealthmanagement.authservice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.mywealthmanagement.authservice.user.Role;
import com.mywealthmanagement.authservice.user.User;
import com.mywealthmanagement.authservice.user.UserRepository;
import org.hamcrest.Matchers;
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
 * End-to-end customer-care flow against the real security chain (H2 dev profile):
 * login → JWT roles → role-gated support access → 360 view → ADMIN-only role grant.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SupportFlowTests {

    @Autowired MockMvc mvc;
    @Autowired UserRepository users;
    @Autowired PasswordEncoder encoder;
    @Autowired ObjectMapper om;

    private Long aliceId;

    @BeforeEach
    void seed() {
        users.deleteAll();
        User agent = new User("care@example.com", encoder.encode("Password123!"),
                new LinkedHashSet<>(List.of(Role.USER, Role.ADMIN, Role.CARE)));
        agent.setName("Care Agent");
        users.save(agent);

        User alice = new User("alice@example.com", encoder.encode("Password123!"),
                new LinkedHashSet<>(List.of(Role.USER)));
        alice.setName("Alice Member");
        alice.setAccountType("INDIVIDUAL");
        alice.setIdentityVerified(true);
        aliceId = users.save(alice).getId();
    }

    private String login(String email, String pw) throws Exception {
        String body = om.writeValueAsString(Map.of("email", email, "password", pw));
        String resp = mvc.perform(post("/api/v1/auth/login").contentType(APPLICATION_JSON).content(body))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return om.readTree(resp).get("token").asText();
    }

    @Test
    void careAgentSeesUsersWhileNormalUserIsBlocked() throws Exception {
        String care = login("care@example.com", "Password123!");
        String alice = login("alice@example.com", "Password123!");

        // 1) Care agent can search members
        mvc.perform(get("/api/v1/support/users").param("query", "alice")
                        .header("Authorization", "Bearer " + care))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.content[0].email").value("alice@example.com"));

        // 2) Care agent can open the 360 view (profile + activity sections)
        mvc.perform(get("/api/v1/support/users/" + aliceId)
                        .header("Authorization", "Bearer " + care))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("alice@example.com"))
                .andExpect(jsonPath("$.identityVerified").value(true))
                .andExpect(jsonPath("$.recentActivity").isArray())
                .andExpect(jsonPath("$.issues").isArray());

        // 3) A normal user is forbidden from the support API
        mvc.perform(get("/api/v1/support/users")
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isForbidden());

        // 4) Unauthenticated is forbidden
        mvc.perform(get("/api/v1/support/users"))
                .andExpect(status().isForbidden());
    }

    @Test
    void roleGrantIsAdminOnly() throws Exception {
        String care = login("care@example.com", "Password123!");   // has ADMIN
        String alice = login("alice@example.com", "Password123!"); // USER only

        String grant = om.writeValueAsString(Map.of("role", "CARE", "action", "GRANT"));

        // Normal user cannot grant roles
        mvc.perform(post("/api/v1/support/users/" + aliceId + "/roles")
                        .contentType(APPLICATION_JSON).content(grant)
                        .header("Authorization", "Bearer " + alice))
                .andExpect(status().isForbidden());

        // Admin can grant CARE to Alice
        mvc.perform(post("/api/v1/support/users/" + aliceId + "/roles")
                        .contentType(APPLICATION_JSON).content(grant)
                        .header("Authorization", "Bearer " + care))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", Matchers.hasItem("CARE")));

        // Alice now has CARE persisted
        org.junit.jupiter.api.Assertions.assertTrue(
                users.findById(aliceId).orElseThrow().getRoles().contains(Role.CARE));
    }
}
