package com.mywealthmanagement.accountaggregationservice.transaction;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CategoryRuleMatcherTest {

    private CategoryRule rule(String type, String pattern, String category) {
        CategoryRule r = new CategoryRule();
        r.setMatchType(type);
        r.setPattern(pattern);
        r.setCategory(category);
        return r;
    }

    @Test
    void containsMatchIsCaseInsensitive() {
        var rules = List.of(rule("CONTAINS", "starbucks", "Coffee"));
        assertThat(CategoryRuleMatcher.categoryFor("STARBUCKS #123", rules)).isEqualTo("Coffee");
    }

    @Test
    void equalsAndStartsWith() {
        assertThat(CategoryRuleMatcher.categoryFor("Netflix",
                List.of(rule("EQUALS", "netflix", "Entertainment")))).isEqualTo("Entertainment");
        assertThat(CategoryRuleMatcher.categoryFor("Amazon Prime",
                List.of(rule("STARTS_WITH", "amazon", "Shopping")))).isEqualTo("Shopping");
    }

    @Test
    void firstMatchingRuleWins() {
        var rules = List.of(
                rule("CONTAINS", "uber eats", "Dining"),
                rule("CONTAINS", "uber", "Transport"));
        assertThat(CategoryRuleMatcher.categoryFor("UBER EATS order", rules)).isEqualTo("Dining");
    }

    @Test
    void noMatchReturnsNull() {
        assertThat(CategoryRuleMatcher.categoryFor("Whole Foods",
                List.of(rule("CONTAINS", "target", "Groceries")))).isNull();
        assertThat(CategoryRuleMatcher.categoryFor(null, List.of())).isNull();
    }
}
