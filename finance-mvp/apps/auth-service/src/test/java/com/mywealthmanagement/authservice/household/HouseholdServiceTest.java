package com.mywealthmanagement.authservice.household;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Household authorization tests (Phase 3a).
 *
 * The critical one is {@code nonMemberCannotAccessAnotherHousehold} — a cross-household read is
 * the failure this whole design exists to prevent. The rest cover revocation taking effect
 * immediately, and invites being single-use, expiring, and bound to the invited email.
 *
 * Uses Mockito stubs backed by in-memory lists (no Spring context) so the authorization
 * rules are exercised directly and the suite stays fast.
 */
class HouseholdServiceTest {

    private HouseholdService service;
    private EntitlementsClient entitlements;
    private FakeHouseholds households;
    private FakeMembers members;
    private FakeInvites invites;

    private static final Long ALICE = 1L, BOB = 2L, MALLORY = 3L;
    private static final String ALICE_EMAIL = "alice@example.com";
    private static final String BOB_EMAIL = "bob@example.com";
    private static final String MALLORY_EMAIL = "mallory@example.com";

    @BeforeEach
    void setUp() {
        households = new FakeHouseholds();
        members = new FakeMembers();
        invites = new FakeInvites();
        // Permissive by default: a Mockito mock's void method does nothing, i.e. entitled.
        entitlements = mock(EntitlementsClient.class);
        service = new HouseholdService(households.repo, members.repo, invites.repo, entitlements);
    }

    // ---------------------------------------------------------------- owner-pays gate

    @Test
    void creatingAHouseholdRequiresThePaidEntitlement() {
        // Server-side gate: a Free user calling the API directly must still be refused.
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "upgrade required"))
                .when(entitlements).requireFeature(HouseholdService.FEATURE_HOUSEHOLD);

        assertThatThrownBy(() -> service.create(ALICE, "Home"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("upgrade required");
    }

    @Test
    void joiningAHouseholdNeverRequiresAnEntitlement() {
        Household h = service.create(ALICE, "Home");
        String token = service.invite(ALICE, h.getId(), BOB_EMAIL);

        // Owner-pays: Bob may be on the Free floor and must still be able to accept.
        doThrow(new ResponseStatusException(HttpStatus.FORBIDDEN, "upgrade required"))
                .when(entitlements).requireFeature(HouseholdService.FEATURE_HOUSEHOLD);

        assertThat(service.accept(BOB, BOB_EMAIL, token).getId()).isEqualTo(h.getId());
    }

    // ---------------------------------------------------------------- the leak test

    @Test
    void nonMemberCannotAccessAnotherHousehold() {
        Household alices = service.create(ALICE, "Alice's place");
        // Mallory is in no household at all.
        assertThatThrownBy(() -> service.requireActiveMember(MALLORY, alices.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not a member");

        // …and having her OWN household grants nothing in Alice's.
        service.create(MALLORY, "Mallory's place");
        assertThatThrownBy(() -> service.requireActiveMember(MALLORY, alices.getId()))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void removedMemberLosesAccessImmediately() {
        Household h = service.create(ALICE, "Home");
        String token = service.invite(ALICE, h.getId(), BOB_EMAIL);
        service.accept(BOB, BOB_EMAIL, token);
        assertThat(service.requireActiveMember(BOB, h.getId())).isNotNull();

        service.removeMember(ALICE, h.getId(), BOB);

        // No token to expire, no cache to bust — the very next check fails.
        assertThatThrownBy(() -> service.requireActiveMember(BOB, h.getId()))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ---------------------------------------------------------------- invites

    @Test
    void inviteCannotBeReplayed() {
        Household h = service.create(ALICE, "Home");
        String token = service.invite(ALICE, h.getId(), BOB_EMAIL);
        service.accept(BOB, BOB_EMAIL, token);

        service.leave(BOB); // free Bob up so the failure is about the token, not membership
        assertThatThrownBy(() -> service.accept(BOB, BOB_EMAIL, token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already been used");
    }

    @Test
    void inviteCannotBeRedeemedByADifferentEmail() {
        Household h = service.create(ALICE, "Home");
        String token = service.invite(ALICE, h.getId(), BOB_EMAIL);

        // A leaked link is useless to anyone it wasn't addressed to.
        assertThatThrownBy(() -> service.accept(MALLORY, MALLORY_EMAIL, token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("different email");
    }

    @Test
    void expiredInviteIsRejected() {
        Household h = service.create(ALICE, "Home");
        String token = service.invite(ALICE, h.getId(), BOB_EMAIL);
        invites.all().forEach(i -> i.setExpiresAt(LocalDateTime.now().minusDays(1)));

        assertThatThrownBy(() -> service.accept(BOB, BOB_EMAIL, token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("expired");
    }

    @Test
    void revokedInviteCannotBeAccepted() {
        Household h = service.create(ALICE, "Home");
        String token = service.invite(ALICE, h.getId(), BOB_EMAIL);
        Long inviteId = invites.all().get(0).getId();
        service.revokeInvite(ALICE, h.getId(), inviteId);

        assertThatThrownBy(() -> service.accept(BOB, BOB_EMAIL, token))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void rawInviteTokenIsNeverStored() {
        Household h = service.create(ALICE, "Home");
        String token = service.invite(ALICE, h.getId(), BOB_EMAIL);
        String stored = invites.all().get(0).getTokenHash();

        assertThat(stored).isNotEqualTo(token);
        assertThat(stored).isEqualTo(HouseholdService.sha256(token));
    }

    // ---------------------------------------------------------------- roles & v1 rules

    @Test
    void onlyOwnerCanInviteOrRemove() {
        Household h = service.create(ALICE, "Home");
        service.accept(BOB, BOB_EMAIL, service.invite(ALICE, h.getId(), BOB_EMAIL));

        assertThatThrownBy(() -> service.invite(BOB, h.getId(), MALLORY_EMAIL))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("owner");
        assertThatThrownBy(() -> service.removeMember(BOB, h.getId(), ALICE))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void userCanOnlyBeInOneHouseholdAtATime() {
        Household alices = service.create(ALICE, "Alice's");
        Household mallorys = service.create(MALLORY, "Mallory's");
        String token = service.invite(MALLORY, mallorys.getId(), ALICE_EMAIL);

        assertThatThrownBy(() -> service.accept(ALICE, ALICE_EMAIL, token))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("already in a household");
        assertThat(alices.getId()).isNotEqualTo(mallorys.getId());
    }

    @Test
    void ownerCannotLeaveWhileOthersRemain() {
        Household h = service.create(ALICE, "Home");
        service.accept(BOB, BOB_EMAIL, service.invite(ALICE, h.getId(), BOB_EMAIL));

        assertThatThrownBy(() -> service.leave(ALICE))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Transfer ownership");
    }

    @Test
    void creatorBecomesOwnerAndSoleMember() {
        Household h = service.create(ALICE, "Home");
        List<HouseholdMember> active = service.activeMembers(h.getId());
        assertThat(active).hasSize(1);
        assertThat(active.get(0).getUserId()).isEqualTo(ALICE);
        assertThat(active.get(0).isOwner()).isTrue();
    }

    // ================================================================= fakes
    //
    // Mockito stubs backed by plain lists: JpaRepository has ~40 methods and we only need a
    // handful, so we stub exactly the queries the service uses and keep the state in memory.

    private static final AtomicLong SEQ = new AtomicLong(0);

    private static class FakeHouseholds {
        final List<Household> rows = new ArrayList<>();
        HouseholdRepository repo = mock(HouseholdRepository.class);
        FakeHouseholds() {
            when(repo.save(any(Household.class))).thenAnswer(inv -> {
                Household h = inv.getArgument(0);
                if (h.getId() == null) { h.setId(SEQ.incrementAndGet()); rows.add(h); }
                return h;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(h -> id.equals(h.getId())).findFirst();
            });
        }
    }

    private static class FakeMembers {
        final List<HouseholdMember> rows = new ArrayList<>();
        HouseholdMemberRepository repo = mock(HouseholdMemberRepository.class);
        FakeMembers() {
            when(repo.save(any(HouseholdMember.class))).thenAnswer(inv -> {
                HouseholdMember m = inv.getArgument(0);
                if (m.getId() == null) { m.setId(SEQ.incrementAndGet()); rows.add(m); }
                return m;
            });
            when(repo.findByUserIdAndStatus(any(), any())).thenAnswer(inv -> {
                Long uid = inv.getArgument(0); String st = inv.getArgument(1);
                return rows.stream().filter(m -> m.getUserId().equals(uid) && st.equals(m.getStatus())).findFirst();
            });
            when(repo.findByHouseholdIdAndStatus(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); String st = inv.getArgument(1);
                return rows.stream().filter(m -> m.getHouseholdId().equals(hid) && st.equals(m.getStatus())).toList();
            });
            when(repo.findByHouseholdIdAndUserId(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); Long uid = inv.getArgument(1);
                return rows.stream().filter(m -> m.getHouseholdId().equals(hid) && m.getUserId().equals(uid)).findFirst();
            });
        }
    }

    private static class FakeInvites {
        final List<HouseholdInvite> rows = new ArrayList<>();
        HouseholdInviteRepository repo = mock(HouseholdInviteRepository.class);
        FakeInvites() {
            when(repo.save(any(HouseholdInvite.class))).thenAnswer(inv -> {
                HouseholdInvite i = inv.getArgument(0);
                if (i.getId() == null) { i.setId(SEQ.incrementAndGet()); rows.add(i); }
                return i;
            });
            when(repo.findByTokenHash(any())).thenAnswer(inv -> {
                String h = inv.getArgument(0);
                return rows.stream().filter(i -> h.equals(i.getTokenHash())).findFirst();
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(i -> id.equals(i.getId())).findFirst();
            });
            when(repo.findByHouseholdIdAndStatus(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); String st = inv.getArgument(1);
                return rows.stream().filter(i -> i.getHouseholdId().equals(hid) && st.equals(i.getStatus())).toList();
            });
        }
        List<HouseholdInvite> all() { return rows; }
    }
}
