package com.mywealthmanagement.authservice.household;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Opt-in account sharing (Phase 3c).
 *
 * The guarantees under test are the ones that make "default private" real: nothing is visible
 * until its owner shares it, sharing never crosses household boundaries, only the owner can
 * revoke, and revoking takes effect immediately.
 */
class HouseholdShareServiceTest {

    private HouseholdService households;
    private HouseholdShareService shares;
    private FakeShares shareRepo;

    private static final Long ALICE = 1L, BOB = 2L, MALLORY = 3L;
    private static final String BOB_EMAIL = "bob@example.com";
    private static final String ACCOUNT = HouseholdShare.TYPE_ACCOUNT;

    @BeforeEach
    void setUp() {
        FakeHouseholds h = new FakeHouseholds();
        FakeMembers m = new FakeMembers();
        FakeInvites i = new FakeInvites();
        households = new HouseholdService(h.repo, m.repo, i.repo, mock(EntitlementsClient.class));
        shareRepo = new FakeShares();
        shares = new HouseholdShareService(households, shareRepo.repo);

        Long hid = households.create(ALICE, "Alice's").getId();
        households.accept(BOB, BOB_EMAIL, households.invite(ALICE, hid, BOB_EMAIL));
        households.create(MALLORY, "Mallory's");
    }

    // ---------------------------------------------------------------- default private

    @Test
    void joiningAHouseholdSharesNothingByDefault() {
        // Alice and Bob are in the same household but neither has shared anything.
        assertThat(shares.visibleFromOthers(BOB, ACCOUNT)).isEmpty();
        assertThat(shares.visibleFromOthers(ALICE, ACCOUNT)).isEmpty();
    }

    @Test
    void aResourceBecomesVisibleOnlyAfterItsOwnerSharesIt() {
        assertThat(shares.visibleFromOthers(BOB, ACCOUNT)).isEmpty();

        shares.share(ALICE, ACCOUNT, "acct-1", "Joint checking");

        assertThat(shares.visibleFromOthers(BOB, ACCOUNT))
                .extracting(HouseholdShare::getResourceId).containsExactly("acct-1");
    }

    @Test
    void revokingRemovesVisibilityImmediately() {
        HouseholdShare s = shares.share(ALICE, ACCOUNT, "acct-1", "Joint checking");
        assertThat(shares.visibleFromOthers(BOB, ACCOUNT)).hasSize(1);

        shares.revoke(ALICE, s.getId());

        assertThat(shares.visibleFromOthers(BOB, ACCOUNT)).isEmpty();
    }

    // ---------------------------------------------------------------- cross-household

    @Test
    void sharesNeverCrossHouseholdBoundaries() {
        shares.share(ALICE, ACCOUNT, "acct-1", "Joint checking");

        // Mallory is in her own household and must see nothing of Alice's.
        assertThat(shares.visibleFromOthers(MALLORY, ACCOUNT)).isEmpty();
        assertThat(shares.sharedWithMyHousehold(MALLORY, ACCOUNT)).isEmpty();
    }

    @Test
    void onlyTheOwnerCanRevokeAShare() {
        HouseholdShare s = shares.share(ALICE, ACCOUNT, "acct-1", "Joint checking");

        // Bob is a fellow member, but it isn't his account to un-share.
        assertThatThrownBy(() -> shares.revoke(BOB, s.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only the person who shared this");
        // …and a stranger certainly cannot.
        assertThatThrownBy(() -> shares.revoke(MALLORY, s.getId()))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(shares.visibleFromOthers(BOB, ACCOUNT)).hasSize(1);
    }

    // ---------------------------------------------------------------- ownership & shape

    @Test
    void aShareIsAlwaysRecordedAgainstTheCaller() {
        HouseholdShare s = shares.share(BOB, ACCOUNT, "bob-acct", "Bob's savings");
        assertThat(s.getOwnerUserId()).isEqualTo(BOB);
    }

    @Test
    void yourOwnSharesAreNotListedAsSharedWithYou() {
        shares.share(ALICE, ACCOUNT, "acct-1", "Joint checking");

        assertThat(shares.visibleFromOthers(ALICE, ACCOUNT)).isEmpty();      // mine isn't "from others"
        assertThat(shares.mySharedResources(ALICE, ACCOUNT)).hasSize(1);     // but it is mine
        assertThat(shares.sharedWithMyHousehold(ALICE, ACCOUNT)).hasSize(1); // and it's in the household
    }

    @Test
    void sharingTheSameResourceTwiceIsANoOp() {
        HouseholdShare a = shares.share(ALICE, ACCOUNT, "acct-1", "Joint checking");
        HouseholdShare b = shares.share(ALICE, ACCOUNT, "acct-1", "Joint checking");

        assertThat(b.getId()).isEqualTo(a.getId());
        assertThat(shares.sharedWithMyHousehold(ALICE, ACCOUNT)).hasSize(1);
    }

    @Test
    void userWithNoHouseholdCanNeitherShareNorList() {
        Long loner = 99L;
        assertThatThrownBy(() -> shares.share(loner, ACCOUNT, "x", "X"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not in a household");
        assertThatThrownBy(() -> shares.sharedWithMyHousehold(loner, ACCOUNT))
                .isInstanceOf(ResponseStatusException.class);
        // …but the "what can I see" helper stays quiet rather than throwing.
        assertThat(shares.visibleFromOthers(loner, ACCOUNT)).isEmpty();
    }

    @Test
    void unsupportedResourceTypesAreRejected() {
        assertThatThrownBy(() -> shares.share(ALICE, "PROPERTY", "p-1", "Condo"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Only ACCOUNT sharing");
    }

    // ================================================================= fakes

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
                String hash = inv.getArgument(0);
                return rows.stream().filter(i -> hash.equals(i.getTokenHash())).findFirst();
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
    }

    private static class FakeShares {
        final List<HouseholdShare> rows = new ArrayList<>();
        HouseholdShareRepository repo = mock(HouseholdShareRepository.class);
        FakeShares() {
            when(repo.save(any(HouseholdShare.class))).thenAnswer(inv -> {
                HouseholdShare s = inv.getArgument(0);
                if (s.getId() == null) { s.setId(SEQ.incrementAndGet()); rows.add(s); }
                return s;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(s -> id.equals(s.getId())).findFirst();
            });
            when(repo.findByHouseholdIdAndResourceType(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); String t = inv.getArgument(1);
                return rows.stream().filter(s -> s.getHouseholdId().equals(hid)
                        && t.equals(s.getResourceType())).toList();
            });
            when(repo.findByOwnerUserIdAndResourceType(any(), any())).thenAnswer(inv -> {
                Long uid = inv.getArgument(0); String t = inv.getArgument(1);
                return rows.stream().filter(s -> s.getOwnerUserId().equals(uid)
                        && t.equals(s.getResourceType())).toList();
            });
            when(repo.findByHouseholdIdAndOwnerUserIdAndResourceTypeAndResourceId(any(), any(), any(), any()))
                    .thenAnswer(inv -> {
                        Long hid = inv.getArgument(0); Long uid = inv.getArgument(1);
                        String t = inv.getArgument(2); String rid = inv.getArgument(3);
                        return rows.stream().filter(s -> s.getHouseholdId().equals(hid)
                                && s.getOwnerUserId().equals(uid)
                                && t.equals(s.getResourceType())
                                && rid.equals(s.getResourceId())).findFirst();
                    });
            doAnswerDelete();
        }
        private void doAnswerDelete() {
            org.mockito.Mockito.doAnswer(inv -> {
                HouseholdShare s = inv.getArgument(0);
                rows.removeIf(r -> r.getId().equals(s.getId()));
                return null;
            }).when(repo).delete(any(HouseholdShare.class));
        }
    }
}
