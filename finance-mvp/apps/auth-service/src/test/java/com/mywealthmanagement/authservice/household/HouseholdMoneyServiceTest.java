package com.mywealthmanagement.authservice.household;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Household-owned goals & bills authorization (Phase 3b).
 *
 * The tests that matter most are the cross-household ones: a member of household A must not be
 * able to read, contribute to, pay, or delete anything owned by household B — and the failure
 * must be a hard 403, not a silently-filtered empty list.
 */
class HouseholdMoneyServiceTest {

    private HouseholdService households;
    private HouseholdMoneyService money;
    private FakeGoals goals;
    private FakeContribs contribs;
    private FakeBills bills;
    private FakePayments payments;

    private static final Long ALICE = 1L, BOB = 2L, MALLORY = 3L;
    private static final String BOB_EMAIL = "bob@example.com";

    private Long aliceHousehold;

    @BeforeEach
    void setUp() {
        FakeHouseholds h = new FakeHouseholds();
        FakeMembers m = new FakeMembers();
        FakeInvites i = new FakeInvites();
        households = new HouseholdService(h.repo, m.repo, i.repo);

        goals = new FakeGoals();
        contribs = new FakeContribs();
        bills = new FakeBills();
        payments = new FakePayments();
        money = new HouseholdMoneyService(households, goals.repo, contribs.repo, bills.repo, payments.repo);

        aliceHousehold = households.create(ALICE, "Alice's").getId();
        households.accept(BOB, BOB_EMAIL, households.invite(ALICE, aliceHousehold, BOB_EMAIL));
        households.create(MALLORY, "Mallory's"); // Mallory has her OWN household — used by the leak tests
    }

    // ---------------------------------------------------------------- the leak tests

    @Test
    void memberOfAnotherHouseholdCannotReadYourGoal() {
        HouseholdGoal g = money.createGoal(ALICE, "New roof", new BigDecimal("5000"), null);

        assertThatThrownBy(() -> money.requireGoal(MALLORY, g.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not a member");
    }

    @Test
    void memberOfAnotherHouseholdCannotContributeToOrDeleteYourGoal() {
        HouseholdGoal g = money.createGoal(ALICE, "New roof", new BigDecimal("5000"), null);

        assertThatThrownBy(() -> money.contribute(MALLORY, g.getId(), new BigDecimal("10"), null, null))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> money.deleteGoal(MALLORY, g.getId()))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void memberOfAnotherHouseholdCannotReadOrPayYourBill() {
        HouseholdBill b = money.createBill(ALICE, "Rent", new BigDecimal("2000"), "MONTHLY", 1);

        assertThatThrownBy(() -> money.requireBill(MALLORY, b.getId()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> money.payBill(MALLORY, b.getId(), new BigDecimal("100"), null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void listsOnlyEverContainYourOwnHouseholdsObjects() {
        money.createGoal(ALICE, "Alice goal", new BigDecimal("100"), null);
        money.createBill(ALICE, "Alice bill", new BigDecimal("50"), "MONTHLY", null);
        money.createGoal(MALLORY, "Mallory goal", new BigDecimal("999"), null);
        money.createBill(MALLORY, "Mallory bill", new BigDecimal("999"), "MONTHLY", null);

        assertThat(money.listGoals(ALICE)).extracting(HouseholdGoal::getName)
                .containsExactly("Alice goal");
        assertThat(money.listBills(ALICE)).extracting(HouseholdBill::getName)
                .containsExactly("Alice bill");
        assertThat(money.listGoals(MALLORY)).extracting(HouseholdGoal::getName)
                .containsExactly("Mallory goal");
    }

    @Test
    void removedMemberImmediatelyLosesAccessToHouseholdMoney() {
        HouseholdGoal g = money.createGoal(ALICE, "New roof", new BigDecimal("5000"), null);
        assertThat(money.requireGoal(BOB, g.getId())).isNotNull(); // Bob is a member

        households.removeMember(ALICE, aliceHousehold, BOB);

        assertThatThrownBy(() -> money.requireGoal(BOB, g.getId()))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> money.listGoals(BOB))
                .isInstanceOf(ResponseStatusException.class); // no household at all now
    }

    // ---------------------------------------------------------------- shared behaviour

    @Test
    void bothMembersSeeTheSameHouseholdGoal() {
        HouseholdGoal g = money.createGoal(ALICE, "Holiday", new BigDecimal("3000"), null);
        assertThat(money.requireGoal(BOB, g.getId()).getId()).isEqualTo(g.getId());
        assertThat(money.listGoals(BOB)).hasSize(1);
    }

    @Test
    void contributionIsAlwaysAttributedToTheCaller() {
        HouseholdGoal g = money.createGoal(ALICE, "Holiday", new BigDecimal("3000"), null);
        HouseholdGoalContribution c = money.contribute(BOB, g.getId(), new BigDecimal("250"), null, "from bonus");

        // You cannot log money "as" someone else — the payer is taken from the session.
        assertThat(c.getUserId()).isEqualTo(BOB);
        assertThat(money.contributionsFor(ALICE, g.getId())).hasSize(1);
    }

    @Test
    void billPaymentIsAttributedToThePayerAndDefaultsToTheBillAmount() {
        HouseholdBill b = money.createBill(ALICE, "Rent", new BigDecimal("2000"), "MONTHLY", 1);
        HouseholdBillPayment p = money.payBill(BOB, b.getId(), null, null);

        assertThat(p.getPaidByUserId()).isEqualTo(BOB);
        assertThat(p.getAmount()).isEqualByComparingTo("2000");
        assertThat(p.getPaidOn()).isEqualTo(LocalDate.now());
    }

    // ---------------------------------------------------------------- validation

    @Test
    void rejectsNonsenseInput() {
        assertThatThrownBy(() -> money.createGoal(ALICE, "  ", new BigDecimal("10"), null))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> money.createGoal(ALICE, "Roof", new BigDecimal("-5"), null))
                .isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> money.createBill(ALICE, "Rent", new BigDecimal("10"), "FORTNIGHTLY", null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void userWithNoHouseholdCannotCreateOrList() {
        Long loner = 99L;
        assertThatThrownBy(() -> money.listGoals(loner))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("not in a household");
        assertThatThrownBy(() -> money.createBill(loner, "Rent", new BigDecimal("10"), "MONTHLY", null))
                .isInstanceOf(ResponseStatusException.class);
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

    private static class FakeGoals {
        final List<HouseholdGoal> rows = new ArrayList<>();
        HouseholdGoalRepository repo = mock(HouseholdGoalRepository.class);
        FakeGoals() {
            when(repo.save(any(HouseholdGoal.class))).thenAnswer(inv -> {
                HouseholdGoal g = inv.getArgument(0);
                if (g.getId() == null) { g.setId(SEQ.incrementAndGet()); rows.add(g); }
                return g;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(g -> id.equals(g.getId())).findFirst();
            });
            when(repo.findByHouseholdIdOrderByIdDesc(any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0);
                return rows.stream().filter(g -> g.getHouseholdId().equals(hid)).toList();
            });
        }
    }

    private static class FakeContribs {
        final List<HouseholdGoalContribution> rows = new ArrayList<>();
        HouseholdGoalContributionRepository repo = mock(HouseholdGoalContributionRepository.class);
        FakeContribs() {
            when(repo.save(any(HouseholdGoalContribution.class))).thenAnswer(inv -> {
                HouseholdGoalContribution c = inv.getArgument(0);
                if (c.getId() == null) { c.setId(SEQ.incrementAndGet()); rows.add(c); }
                return c;
            });
            when(repo.findByHouseholdGoalIdOrderByOccurredOnDesc(any())).thenAnswer(inv -> {
                Long gid = inv.getArgument(0);
                return rows.stream().filter(c -> c.getHouseholdGoalId().equals(gid)).toList();
            });
        }
    }

    private static class FakeBills {
        final List<HouseholdBill> rows = new ArrayList<>();
        HouseholdBillRepository repo = mock(HouseholdBillRepository.class);
        FakeBills() {
            when(repo.save(any(HouseholdBill.class))).thenAnswer(inv -> {
                HouseholdBill b = inv.getArgument(0);
                if (b.getId() == null) { b.setId(SEQ.incrementAndGet()); rows.add(b); }
                return b;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(b -> id.equals(b.getId())).findFirst();
            });
            when(repo.findByHouseholdIdOrderByIdDesc(any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0);
                return rows.stream().filter(b -> b.getHouseholdId().equals(hid)).toList();
            });
        }
    }

    private static class FakePayments {
        final List<HouseholdBillPayment> rows = new ArrayList<>();
        HouseholdBillPaymentRepository repo = mock(HouseholdBillPaymentRepository.class);
        FakePayments() {
            when(repo.save(any(HouseholdBillPayment.class))).thenAnswer(inv -> {
                HouseholdBillPayment p = inv.getArgument(0);
                if (p.getId() == null) { p.setId(SEQ.incrementAndGet()); rows.add(p); }
                return p;
            });
            when(repo.findByHouseholdBillIdOrderByPaidOnDesc(any())).thenAnswer(inv -> {
                Long bid = inv.getArgument(0);
                return rows.stream().filter(p -> p.getHouseholdBillId().equals(bid)).toList();
            });
        }
    }
}
