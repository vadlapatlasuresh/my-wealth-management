package com.mywealthmanagement.authservice.family;

import com.mywealthmanagement.authservice.household.EntitlementsClient;
import com.mywealthmanagement.authservice.household.Household;
import com.mywealthmanagement.authservice.household.HouseholdInvite;
import com.mywealthmanagement.authservice.household.HouseholdInviteRepository;
import com.mywealthmanagement.authservice.household.HouseholdMember;
import com.mywealthmanagement.authservice.household.HouseholdMemberRepository;
import com.mywealthmanagement.authservice.household.HouseholdRepository;
import com.mywealthmanagement.authservice.household.HouseholdService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Family / kids mode (Phase 5, backlog B3).
 *
 * Two groups of tests, both chosen because the failure mode is silent:
 *   • ISOLATION — a guardian in household A must get a hard 403 on household B's child, not a
 *     filtered empty list. Same bar as HouseholdMoneyServiceTest.
 *   • MONEY — the split must never lose or invent a cent, and completing a chore twice must not
 *     pay twice. These are the bugs a ten-year-old finds first.
 */
class FamilyServiceTest {

    private static final AtomicLong SEQ = new AtomicLong(0);
    private static final Long ALICE = 1L, BOB = 2L, MALLORY = 3L;

    private HouseholdService households;
    private FamilyService family;

    @BeforeEach
    void setUp() {
        FakeHouseholds h = new FakeHouseholds();
        FakeMembers m = new FakeMembers();
        FakeInvites i = new FakeInvites();
        households = new HouseholdService(h.repo, m.repo, i.repo, mock(EntitlementsClient.class));
        family = new FamilyService(households, new FakeFamilyMembers().repo, new FakeLedger().repo,
                new FakeChores().repo, mock(EntitlementsClient.class));

        Long aliceHousehold = households.create(ALICE, "Alice's").getId();
        households.accept(BOB, "bob@example.com", households.invite(ALICE, aliceHousehold, "bob@example.com"));
        households.create(MALLORY, "Mallory's"); // her own household — the isolation counterparty
    }

    private FamilyMember addKid(Long guardian, String name, String amount, int spend, int save, int give) {
        return family.addMember(guardian, name, 2015, new BigDecimal(amount),
                FamilyMember.CADENCE_WEEKLY, 1, spend, save, give);
    }

    // ---------------------------------------------------------------- isolation

    @Test
    void anotherHouseholdCannotSeeOrTouchYourChild() {
        FamilyMember kid = addKid(ALICE, "Robin", "10.00", 100, 0, 0);

        assertThatThrownBy(() -> family.requireMember(MALLORY, kid.getId()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> family.ledgerFor(MALLORY, kid.getId()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> family.payAllowance(MALLORY, kid.getId(), null, null, null))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> family.archiveMember(MALLORY, kid.getId()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> family.addChore(MALLORY, kid.getId(), "Sweep", BigDecimal.ONE))
                .isInstanceOf(ResponseStatusException.class);

        // And her own list stays empty rather than leaking Alice's child.
        assertThat(family.listMembers(MALLORY)).isEmpty();
    }

    @Test
    void everyGuardianInTheHouseholdSeesTheSameChildren() {
        addKid(ALICE, "Robin", "10.00", 100, 0, 0);
        // Bob joined Alice's household, so the child is his to manage too — that is the point
        // of a household-owned record rather than a creator-owned one.
        assertThat(family.listMembers(BOB)).extracting(FamilyMember::getName).containsExactly("Robin");
    }

    @Test
    void familyModeRequiresAHousehold() {
        Long loner = 99L;
        assertThatThrownBy(() -> family.listMembers(loner))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("household");
    }

    // ---------------------------------------------------------------- the split

    @Test
    void allowanceIsSplitAcrossBucketsAndAlwaysSumsToWhatWasPaid() {
        FamilyMember kid = addKid(ALICE, "Robin", "10.00", 50, 30, 20);
        family.payAllowance(ALICE, kid.getId(), null, LocalDate.of(2026, 7, 1), "Weekly");

        Map<String, BigDecimal> b = family.balances(ALICE, kid.getId());
        assertThat(b.get("SPEND")).isEqualByComparingTo("5.00");
        assertThat(b.get("SAVE")).isEqualByComparingTo("3.00");
        assertThat(b.get("GIVE")).isEqualByComparingTo("2.00");
        assertThat(b.get("TOTAL")).isEqualByComparingTo("10.00");
    }

    @Test
    void roundingGoesToSpendSoNoCentIsLostOrInvented() {
        // 10.00 split three ways at 33/33/34 doesn't divide cleanly.
        FamilyMember kid = addKid(ALICE, "Robin", "10.00", 33, 33, 34);
        family.payAllowance(ALICE, kid.getId(), null, null, null);

        Map<String, BigDecimal> b = family.balances(ALICE, kid.getId());
        assertThat(b.get("TOTAL")).isEqualByComparingTo("10.00"); // the invariant that matters
        assertThat(b.get("SAVE")).isEqualByComparingTo("3.30");
        assertThat(b.get("GIVE")).isEqualByComparingTo("3.40");
        assertThat(b.get("SPEND")).isEqualByComparingTo("3.30");
    }

    @Test
    void aSplitThatDoesNotAddUpIsRejectedRatherThanGuessed() {
        assertThatThrownBy(() -> addKid(ALICE, "Robin", "10.00", 50, 30, 30))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("add up to 100");
    }

    @Test
    void payingAnAllowanceWithNoAmountSetIsRefused() {
        FamilyMember kid = addKid(ALICE, "Robin", "0", 100, 0, 0);
        assertThatThrownBy(() -> family.payAllowance(ALICE, kid.getId(), null, null, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("allowance amount");
    }

    // ---------------------------------------------------------------- spending & chores

    @Test
    void spendingLeavesTheBucketWhicheverSignTheCallerSends() {
        FamilyMember kid = addKid(ALICE, "Robin", "20.00", 100, 0, 0);
        family.payAllowance(ALICE, kid.getId(), null, null, null);

        // A positive amount with type SPEND still reduces the balance.
        family.addEntry(ALICE, kid.getId(), "SPEND", "SPEND", new BigDecimal("6.00"), null, "Comics");
        assertThat(family.balances(ALICE, kid.getId()).get("SPEND")).isEqualByComparingTo("14.00");
    }

    @Test
    void completingAChorePaysTheRewardExactlyOnce() {
        FamilyMember kid = addKid(ALICE, "Robin", "0", 100, 0, 0);
        FamilyChore chore = family.addChore(ALICE, kid.getId(), "Dishes", new BigDecimal("2.50"));

        family.completeChore(ALICE, kid.getId(), chore.getId());
        assertThat(family.balances(ALICE, kid.getId()).get("SPEND")).isEqualByComparingTo("2.50");

        // Double-tap: still 2.50, not 5.00.
        family.completeChore(ALICE, kid.getId(), chore.getId());
        assertThat(family.balances(ALICE, kid.getId()).get("SPEND")).isEqualByComparingTo("2.50");
    }

    @Test
    void archivingKeepsTheLedgerButHidesTheChild() {
        FamilyMember kid = addKid(ALICE, "Robin", "10.00", 100, 0, 0);
        family.payAllowance(ALICE, kid.getId(), null, null, null);

        family.archiveMember(ALICE, kid.getId());
        assertThat(family.listMembers(ALICE)).isEmpty();
        // The money that changed hands is still on the record.
        assertThat(family.ledgerFor(ALICE, kid.getId())).hasSize(1);
    }

    // ---------------------------------------------------------------- allowance reminder

    @Test
    void theReminderOnlyFiresForAllowancesActuallyDueThatDay() {
        FakeFamilyMembers store = new FakeFamilyMembers();
        // A Saturday-weekly allowance, a 15th-of-the-month one, and one with no money set.
        FamilyMember saturday = seed(store, "Robin", "10.00", FamilyMember.CADENCE_WEEKLY, 6);
        FamilyMember fifteenth = seed(store, "Sam", "40.00", FamilyMember.CADENCE_MONTHLY, 15);
        seed(store, "Unfunded", "0", FamilyMember.CADENCE_WEEKLY, 6);

        AllowanceReminderJob job = new AllowanceReminderJob(
                store.repo, mock(HouseholdMemberRepository.class), true, "http://localhost:0", "k");

        // 2026-07-04 is a Saturday.
        assertThat(job.dueOn(LocalDate.of(2026, 7, 4))).containsExactly(saturday);
        // 2026-07-15 is a Wednesday — only the monthly one is due.
        assertThat(job.dueOn(LocalDate.of(2026, 7, 15))).containsExactly(fifteenth);
        // 2026-07-16: nobody.
        assertThat(job.dueOn(LocalDate.of(2026, 7, 16))).isEmpty();
    }

    @Test
    void theReminderIgnoresArchivedChildrenAndMembersWithNoPayday() {
        FakeFamilyMembers store = new FakeFamilyMembers();
        FamilyMember archived = seed(store, "Gone", "10.00", FamilyMember.CADENCE_WEEKLY, 6);
        archived.setStatus(FamilyMember.STATUS_ARCHIVED);
        FamilyMember noDay = seed(store, "NoDay", "10.00", FamilyMember.CADENCE_WEEKLY, null);
        assertThat(noDay.getAllowanceDay()).isNull();

        AllowanceReminderJob job = new AllowanceReminderJob(
                store.repo, mock(HouseholdMemberRepository.class), true, "http://localhost:0", "k");
        assertThat(job.dueOn(LocalDate.of(2026, 7, 4))).isEmpty();
    }

    private static FamilyMember seed(FakeFamilyMembers store, String name, String amount,
                                     String cadence, Integer day) {
        FamilyMember m = new FamilyMember();
        m.setHouseholdId(1L);
        m.setCreatedByUserId(ALICE);
        m.setName(name);
        m.setAllowanceAmount(new BigDecimal(amount));
        m.setAllowanceCadence(cadence);
        m.setAllowanceDay(day);
        return store.repo.save(m);
    }

    // ---------------------------------------------------------------- fakes

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

    private static class FakeFamilyMembers {
        final List<FamilyMember> rows = new ArrayList<>();
        FamilyMemberRepository repo = mock(FamilyMemberRepository.class);
        FakeFamilyMembers() {
            when(repo.findAll()).thenAnswer(inv -> List.copyOf(rows));
            when(repo.save(any(FamilyMember.class))).thenAnswer(inv -> {
                FamilyMember m = inv.getArgument(0);
                if (m.getId() == null) { m.setId(SEQ.incrementAndGet()); rows.add(m); }
                return m;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(m -> id.equals(m.getId())).findFirst();
            });
            when(repo.findByHouseholdIdAndStatusOrderByIdAsc(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); String st = inv.getArgument(1);
                return rows.stream().filter(m -> m.getHouseholdId().equals(hid) && st.equals(m.getStatus())).toList();
            });
        }
    }

    private static class FakeLedger {
        final List<FamilyLedgerEntry> rows = new ArrayList<>();
        FamilyLedgerEntryRepository repo = mock(FamilyLedgerEntryRepository.class);
        FakeLedger() {
            when(repo.save(any(FamilyLedgerEntry.class))).thenAnswer(inv -> {
                FamilyLedgerEntry e = inv.getArgument(0);
                if (e.getId() == null) { e.setId(SEQ.incrementAndGet()); rows.add(e); }
                return e;
            });
            when(repo.findByFamilyMemberIdOrderByOccurredOnDescIdDesc(any())).thenAnswer(inv -> {
                Long mid = inv.getArgument(0);
                return rows.stream().filter(e -> e.getFamilyMemberId().equals(mid)).toList();
            });
        }
    }

    private static class FakeChores {
        final List<FamilyChore> rows = new ArrayList<>();
        FamilyChoreRepository repo = mock(FamilyChoreRepository.class);
        FakeChores() {
            when(repo.save(any(FamilyChore.class))).thenAnswer(inv -> {
                FamilyChore c = inv.getArgument(0);
                if (c.getId() == null) { c.setId(SEQ.incrementAndGet()); rows.add(c); }
                return c;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(c -> id.equals(c.getId())).findFirst();
            });
            when(repo.findByFamilyMemberIdOrderByCompletedAtAscIdDesc(any())).thenAnswer(inv -> {
                Long mid = inv.getArgument(0);
                return rows.stream().filter(c -> c.getFamilyMemberId().equals(mid)).toList();
            });
        }
    }
}
