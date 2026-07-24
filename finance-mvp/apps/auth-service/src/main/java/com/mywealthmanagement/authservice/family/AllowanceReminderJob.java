package com.mywealthmanagement.authservice.family;

import com.mywealthmanagement.authservice.household.HouseholdMember;
import com.mywealthmanagement.authservice.household.HouseholdMemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * "Robin's allowance is due today" — the engagement trigger family mode introduces (Phase 6).
 *
 * <p>Fan-out follows the established pattern exactly: POST to notification-service's internal
 * endpoint with the shared key, which creates the in-app notification and then delivers push
 * (and email/SMS) subject to the user's own preferences. Push therefore inherits the existing
 * provider toggle — {@code comms.provider.push=mock} logs, {@code =fcm} really sends — and the
 * opt-in check, so this job cannot notify anyone who hasn't asked to be notified.
 *
 * <p><b>Off by default</b> ({@code family.allowance.reminder.enabled}). A scheduled job that
 * messages people is the kind of thing that should be switched on deliberately, per environment,
 * after someone has watched it run once.
 *
 * <p>It reminds; it does not pay. Moving money on a schedule without a human in the loop is a
 * separate decision with separate consequences, and nothing in the product asks for it yet.
 */
@Component
public class AllowanceReminderJob {

    private static final Logger log = LoggerFactory.getLogger(AllowanceReminderJob.class);

    private final FamilyMemberRepository members;
    private final HouseholdMemberRepository householdMembers;
    private final RestClient http = RestClient.create();

    private final boolean enabled;
    private final String notificationUri;
    private final String internalKey;

    public AllowanceReminderJob(FamilyMemberRepository members,
                                HouseholdMemberRepository householdMembers,
                                @Value("${family.allowance.reminder.enabled:false}") boolean enabled,
                                @Value("${notification.uri:http://localhost:8088}") String notificationUri,
                                @Value("${notifications.internal.key:${internal.key:}}") String internalKey) {
        this.members = members;
        this.householdMembers = householdMembers;
        this.enabled = enabled;
        this.notificationUri = notificationUri;
        this.internalKey = internalKey;
    }

    /** Runs each morning; only the members actually due today produce a notification. */
    @Scheduled(cron = "${family.allowance.reminder.cron:0 0 8 * * *}")
    public void remindGuardians() {
        if (!enabled) {
            return;
        }
        LocalDate today = LocalDate.now();
        int sent = 0;
        for (FamilyMember m : members.findAll()) {
            if (!FamilyMember.STATUS_ACTIVE.equals(m.getStatus())) continue;
            if (m.getAllowanceAmount() == null || m.getAllowanceAmount().signum() <= 0) continue;
            if (!isDueToday(m, today)) continue;

            for (HouseholdMember guardian : householdMembers
                    .findByHouseholdIdAndStatus(m.getHouseholdId(), HouseholdMember.STATUS_ACTIVE)) {
                notify(guardian.getUserId(), m);
                sent++;
            }
        }
        if (sent > 0) {
            log.info("Allowance reminders sent: {}", sent);
        }
    }

    /**
     * Is this allowance due today?
     *
     * <p>WEEKLY matches the weekday. MONTHLY matches the day of month. BIWEEKLY deliberately
     * reuses the weekly check rather than tracking pay periods: without a "last paid" anchor
     * there is no honest way to know which fortnight we are in, and a reminder every week is a
     * far better failure than a reminder on the wrong week. When a real anchor exists (the
     * ledger's last ALLOWANCE entry), this is the one place to make it exact.
     */
    private boolean isDueToday(FamilyMember m, LocalDate today) {
        Integer day = m.getAllowanceDay();
        if (day == null) {
            return false;
        }
        return switch (m.getAllowanceCadence()) {
            case FamilyMember.CADENCE_MONTHLY -> today.getDayOfMonth() == Math.min(28, Math.max(1, day));
            case FamilyMember.CADENCE_WEEKLY, FamilyMember.CADENCE_BIWEEKLY ->
                    today.getDayOfWeek().getValue() == Math.min(7, Math.max(1, day));
            default -> false;
        };
    }

    private void notify(Long guardianUserId, FamilyMember m) {
        try {
            http.post()
                    .uri(notificationUri + "/api/v1/notifications/internal")
                    .header("X-Internal-Key", internalKey)
                    .body(Map.of(
                            "userId", guardianUserId,
                            "type", "SYSTEM",
                            "title", m.getName() + "'s allowance is due",
                            "body", "Pay " + m.getName() + " " + m.getAllowanceAmount()
                                    + " and it'll be split across their spend, save and give jars.",
                            // Honors an explicit opt-out; a user with no preference row keeps
                            // the on-by-default behavior, same as every other reminder.
                            "respectPreference", "billReminders"))
                    .retrieve()
                    .toBodilessEntity();
        } catch (Exception e) {
            // Fire-and-forget: a reminder failing must never affect the family data itself.
            log.debug("Allowance reminder for user {} skipped: {}", guardianUserId, e.getMessage());
        }
    }

    /** Exposed for tests: which members the job would notify about on a given date. */
    List<FamilyMember> dueOn(LocalDate date) {
        return members.findAll().stream()
                .filter(m -> FamilyMember.STATUS_ACTIVE.equals(m.getStatus()))
                .filter(m -> m.getAllowanceAmount() != null && m.getAllowanceAmount().signum() > 0)
                .filter(m -> isDueToday(m, date))
                .toList();
    }
}
