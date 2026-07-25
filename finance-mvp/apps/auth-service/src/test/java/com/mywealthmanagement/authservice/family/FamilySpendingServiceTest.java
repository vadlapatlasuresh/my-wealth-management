package com.mywealthmanagement.authservice.family;

import com.mywealthmanagement.authservice.household.CommsClient;
import com.mywealthmanagement.authservice.household.EntitlementsClient;
import com.mywealthmanagement.authservice.household.Household;
import com.mywealthmanagement.authservice.household.HouseholdInvite;
import com.mywealthmanagement.authservice.household.HouseholdInviteRepository;
import com.mywealthmanagement.authservice.household.HouseholdMember;
import com.mywealthmanagement.authservice.household.HouseholdMemberRepository;
import com.mywealthmanagement.authservice.household.HouseholdRepository;
import com.mywealthmanagement.authservice.household.HouseholdService;
import com.mywealthmanagement.authservice.user.UserRepository;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * Kids' cards & spending (Phase 5 extension). The tests target the failures that would be silent or
 * a security problem:
 *   • OWNERSHIP — you can only link a card you actually own (the whole safety story), and another
 *     household's guardian gets a hard 403 on your child.
 *   • SYNC — materialization is idempotent (dedupe on external id), so re-syncing never double-counts.
 *   • RULES — a LOCATION rule overrides the card's default child.
 *   • BUDGETS — spent-vs-limit rolls up correctly for the month.
 */
class FamilySpendingServiceTest {

    private static final AtomicLong SEQ = new AtomicLong(0);
    private static final Long ALICE = 1L, BOB = 2L, MALLORY = 3L;

    private HouseholdService households;
    private FamilyService family;
    private FamilySpendingService spending;
    private AggregationClient aggregation;
    private Long aliceHousehold;

    @BeforeEach
    void setUp() {
        FakeHouseholds h = new FakeHouseholds();
        FakeMembers m = new FakeMembers();
        FakeInvites i = new FakeInvites();
        households = new HouseholdService(h.repo, m.repo, i.repo, mock(EntitlementsClient.class),
                mock(CommsClient.class), mock(UserRepository.class));

        FamilyMemberRepository famMembers = new FakeFamilyMembers().repo;
        family = new FamilyService(households, famMembers, new FakeLedger().repo,
                new FakeChores().repo, mock(EntitlementsClient.class));

        aggregation = mock(AggregationClient.class);
        when(aggregation.isEnabled()).thenReturn(true);
        spending = new FamilySpendingService(households, family, famMembers,
                new FakeCards().repo, new FakeRules().repo, new FakeBudgets().repo, new FakeTxns().repo,
                aggregation);

        aliceHousehold = households.create(ALICE, "Alice's").getId();
        households.accept(BOB, "bob@example.com",
                households.invite(ALICE, aliceHousehold, "bob@example.com").rawToken());
        households.create(MALLORY, "Mallory's"); // isolation counterparty
    }

    private FamilyMember kid(Long guardian, String name) {
        return family.addMember(guardian, name, 2015, new BigDecimal("10.00"),
                FamilyMember.CADENCE_WEEKLY, 1, 100, 0, 0);
    }

    // ---------------------------------------------------------------- ownership

    @Test
    void youCanOnlyLinkACardYouActuallyOwn() {
        FamilyMember robin = kid(ALICE, "Robin");
        // Alice owns account 500, not 999.
        when(aggregation.cardsOf(ALICE)).thenReturn(List.of(
                new AggregationClient.Card(500L, "Alice Debit", "Alice Debit", "1234", "depository", "checking")));

        assertThatThrownBy(() -> spending.linkCard(ALICE, robin.getId(), 999L, null))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("your own connected accounts");

        FamilyCard linked = spending.linkCard(ALICE, robin.getId(), 500L, null);
        assertThat(linked.getSourceType()).isEqualTo(FamilyCard.SOURCE_LINKED);
        assertThat(linked.getLinkedOwnerUserId()).isEqualTo(ALICE);
    }

    @Test
    void anotherHouseholdCannotAddACardToYourChild() {
        FamilyMember robin = kid(ALICE, "Robin");
        // Mallory is in her own household; Robin isn't hers.
        assertThatThrownBy(() -> spending.addManualCard(MALLORY, robin.getId(), "Sneaky", "0000"))
                .isInstanceOf(ResponseStatusException.class);
    }

    // ---------------------------------------------------------------- sync

    @Test
    void syncMaterializesMatchedSpendAndNeverDoubleCounts() {
        FamilyMember robin = kid(ALICE, "Robin");
        when(aggregation.cardsOf(ALICE)).thenReturn(List.of(
                new AggregationClient.Card(500L, "Alice Debit", "Alice Debit", "1234", "depository", "checking")));
        spending.linkCard(ALICE, robin.getId(), 500L, "Robin's card");

        when(aggregation.transactions(eq(ALICE), any(), any(), any())).thenReturn(List.of(
                new AggregationClient.Txn("plaid-1", 500L, "Sweets", "Candy Store", "Food",
                        new BigDecimal("4.50"), LocalDate.now()),
                new AggregationClient.Txn("plaid-2", 500L, "Toy", "Toy Shop", "Toys",
                        new BigDecimal("9.00"), LocalDate.now())));

        assertThat(spending.sync(ALICE)).isEqualTo(2);
        // Re-sync with the same feed writes nothing new.
        assertThat(spending.sync(ALICE)).isEqualTo(0);

        assertThat(spending.listTransactions(ALICE, robin.getId())).hasSize(2);
        Map<String, Object> summary = spending.spendingSummary(ALICE);
        assertThat((BigDecimal) summary.get("total")).isEqualByComparingTo("13.50");
    }

    @Test
    void aLocationRuleOverridesTheCardsDefaultChild() {
        FamilyMember robin = kid(ALICE, "Robin");
        FamilyMember sam = kid(ALICE, "Sam");
        when(aggregation.cardsOf(ALICE)).thenReturn(List.of(
                new AggregationClient.Card(500L, "Shared Debit", "Shared Debit", "1234", "depository", "checking")));
        spending.linkCard(ALICE, robin.getId(), 500L, "Shared card"); // card defaults to Robin
        // But anything at "Bookstore" is Sam's.
        spending.addRule(ALICE, sam.getId(), FamilyTxnRule.MATCH_LOCATION, null, "Bookstore", "SPEND");

        when(aggregation.transactions(eq(ALICE), any(), any(), any())).thenReturn(List.of(
                new AggregationClient.Txn("p-1", 500L, "Snacks", "Corner Shop", "Food",
                        new BigDecimal("3.00"), LocalDate.now()),
                new AggregationClient.Txn("p-2", 500L, "Novel", "The Bookstore", "Books",
                        new BigDecimal("12.00"), LocalDate.now())));
        spending.sync(ALICE);

        assertThat(spending.listTransactions(ALICE, sam.getId())).hasSize(1);   // the bookstore one
        assertThat(spending.listTransactions(ALICE, robin.getId())).hasSize(1); // the corner shop one
    }

    // ---------------------------------------------------------------- budgets

    @Test
    void budgetProgressRollsUpSpentAgainstTheLimit() {
        FamilyMember robin = kid(ALICE, "Robin");
        spending.addManualTransaction(ALICE, robin.getId(), new BigDecimal("15.00"),
                "Candy Store", "Food", "Main St", LocalDate.now(), null, "SPEND");
        spending.addManualTransaction(ALICE, robin.getId(), new BigDecimal("5.00"),
                "Bus", "Transport", null, LocalDate.now(), null, "SPEND");
        spending.addBudget(ALICE, robin.getId(), "Food", new BigDecimal("40.00"));

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> budgets = (List<Map<String, Object>>) spending.spendingSummary(ALICE).get("budgets");
        assertThat(budgets).hasSize(1);
        assertThat((BigDecimal) budgets.get(0).get("spent")).isEqualByComparingTo("15.00"); // only Food
        assertThat((BigDecimal) budgets.get(0).get("monthlyLimit")).isEqualByComparingTo("40.00");
    }

    // ================================================================= fakes

    private static class FakeHouseholds {
        final List<Household> rows = new ArrayList<>();
        HouseholdRepository repo = mock(HouseholdRepository.class);
        FakeHouseholds() {
            when(repo.save(any(Household.class))).thenAnswer(inv -> {
                Household x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(x -> id.equals(x.getId())).findFirst();
            });
        }
    }

    private static class FakeMembers {
        final List<HouseholdMember> rows = new ArrayList<>();
        HouseholdMemberRepository repo = mock(HouseholdMemberRepository.class);
        FakeMembers() {
            when(repo.save(any(HouseholdMember.class))).thenAnswer(inv -> {
                HouseholdMember x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findByUserIdAndStatus(any(), any())).thenAnswer(inv -> {
                Long uid = inv.getArgument(0); String st = inv.getArgument(1);
                return rows.stream().filter(x -> x.getUserId().equals(uid) && st.equals(x.getStatus())).findFirst();
            });
            when(repo.findByHouseholdIdAndStatus(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); String st = inv.getArgument(1);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid) && st.equals(x.getStatus())).toList();
            });
            when(repo.findByHouseholdIdAndUserId(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); Long uid = inv.getArgument(1);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid) && x.getUserId().equals(uid)).findFirst();
            });
        }
    }

    private static class FakeInvites {
        final List<HouseholdInvite> rows = new ArrayList<>();
        HouseholdInviteRepository repo = mock(HouseholdInviteRepository.class);
        FakeInvites() {
            when(repo.save(any(HouseholdInvite.class))).thenAnswer(inv -> {
                HouseholdInvite x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findByTokenHash(any())).thenAnswer(inv -> {
                String hash = inv.getArgument(0);
                return rows.stream().filter(x -> hash.equals(x.getTokenHash())).findFirst();
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(x -> id.equals(x.getId())).findFirst();
            });
        }
    }

    private static class FakeFamilyMembers {
        final List<FamilyMember> rows = new ArrayList<>();
        FamilyMemberRepository repo = mock(FamilyMemberRepository.class);
        FakeFamilyMembers() {
            when(repo.save(any(FamilyMember.class))).thenAnswer(inv -> {
                FamilyMember x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(x -> id.equals(x.getId())).findFirst();
            });
            when(repo.findByHouseholdIdAndStatusOrderByIdAsc(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); String st = inv.getArgument(1);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid) && st.equals(x.getStatus())).toList();
            });
        }
    }

    private static class FakeLedger {
        FamilyLedgerEntryRepository repo = mock(FamilyLedgerEntryRepository.class);
        FakeLedger() {
            when(repo.save(any(FamilyLedgerEntry.class))).thenAnswer(inv -> inv.getArgument(0));
            when(repo.findByFamilyMemberIdOrderByOccurredOnDescIdDesc(any())).thenReturn(List.of());
        }
    }

    private static class FakeChores {
        FamilyChoreRepository repo = mock(FamilyChoreRepository.class);
        FakeChores() {
            when(repo.findByFamilyMemberIdOrderByCompletedAtAscIdDesc(any())).thenReturn(List.of());
        }
    }

    private static class FakeCards {
        final List<FamilyCard> rows = new ArrayList<>();
        FamilyCardRepository repo = mock(FamilyCardRepository.class);
        FakeCards() {
            when(repo.save(any(FamilyCard.class))).thenAnswer(inv -> {
                FamilyCard x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findById(any())).thenAnswer(inv -> {
                Long id = inv.getArgument(0);
                return rows.stream().filter(x -> id.equals(x.getId())).findFirst();
            });
            when(repo.findByHouseholdIdOrderByIdDesc(any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid)).toList();
            });
            when(repo.findByFamilyMemberIdOrderByIdDesc(any())).thenAnswer(inv -> {
                Long mid = inv.getArgument(0);
                return rows.stream().filter(x -> x.getFamilyMemberId().equals(mid)).toList();
            });
        }
    }

    private static class FakeRules {
        final List<FamilyTxnRule> rows = new ArrayList<>();
        FamilyTxnRuleRepository repo = mock(FamilyTxnRuleRepository.class);
        FakeRules() {
            when(repo.save(any(FamilyTxnRule.class))).thenAnswer(inv -> {
                FamilyTxnRule x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findByHouseholdIdOrderByIdDesc(any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid)).toList();
            });
        }
    }

    private static class FakeBudgets {
        final List<FamilyBudget> rows = new ArrayList<>();
        FamilyBudgetRepository repo = mock(FamilyBudgetRepository.class);
        FakeBudgets() {
            when(repo.save(any(FamilyBudget.class))).thenAnswer(inv -> {
                FamilyBudget x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findByHouseholdIdOrderByIdDesc(any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid)).toList();
            });
        }
    }

    private static class FakeTxns {
        final List<FamilyTransaction> rows = new ArrayList<>();
        FamilyTransactionRepository repo = mock(FamilyTransactionRepository.class);
        FakeTxns() {
            when(repo.save(any(FamilyTransaction.class))).thenAnswer(inv -> {
                FamilyTransaction x = inv.getArgument(0);
                if (x.getId() == null) { x.setId(SEQ.incrementAndGet()); rows.add(x); }
                return x;
            });
            when(repo.findByHouseholdIdOrderByOccurredOnDescIdDesc(any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid)).toList();
            });
            when(repo.findByFamilyMemberIdOrderByOccurredOnDescIdDesc(any())).thenAnswer(inv -> {
                Long mid = inv.getArgument(0);
                return rows.stream().filter(x -> x.getFamilyMemberId().equals(mid)).toList();
            });
            when(repo.findByHouseholdIdAndOccurredOnBetween(any(), any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); LocalDate from = inv.getArgument(1); LocalDate to = inv.getArgument(2);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid)
                        && !x.getOccurredOn().isBefore(from) && !x.getOccurredOn().isAfter(to)).toList();
            });
            when(repo.findByHouseholdIdAndExternalId(any(), any())).thenAnswer(inv -> {
                Long hid = inv.getArgument(0); String ext = inv.getArgument(1);
                return rows.stream().filter(x -> x.getHouseholdId().equals(hid)
                        && ext != null && ext.equals(x.getExternalId())).findFirst();
            });
        }
    }
}
