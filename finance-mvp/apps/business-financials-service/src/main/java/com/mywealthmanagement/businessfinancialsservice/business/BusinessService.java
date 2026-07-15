package com.mywealthmanagement.businessfinancialsservice.business;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessDashboardDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.InvoiceDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.PnlDto;
import com.mywealthmanagement.businessfinancialsservice.business.provider.BusinessDataProvider;
import com.mywealthmanagement.businessfinancialsservice.business.provider.QboOAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class BusinessService {

    private static final String DEFAULT_COMPANY_NAME = "Summit Ventures LLC";

    private final QboConnectionRepository connectionRepository;
    private final BusinessDataProvider dataProvider;
    private final QboOAuthService oauthService;

    /**
     * The single test/demo user id that mock QuickBooks data is allowed to show for.
     * Unset (blank) in production, so regular users are NEVER auto-connected to mock
     * QuickBooks and never see fabricated dashboard/invoice/expense figures.
     */
    @Value("${app.demo.user-id:}")
    private String demoUserIdRaw;

    private Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /** True only for the configured demo user (when one is set). */
    private boolean isDemoUser(Long userId) {
        if (userId == null || demoUserIdRaw == null || demoUserIdRaw.isBlank()) return false;
        try {
            return userId.equals(Long.valueOf(demoUserIdRaw.trim()));
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /**
     * Whether a live QuickBooks OAuth connection is possible (real provider configured).
     * When false the service runs in mock mode and {@link #connect()} returns the demo connection.
     */
    public boolean qboConfigured() {
        return oauthService.isConfigured();
    }

    /** Intuit consent URL for the current user to authorize QuickBooks. */
    public String authorizeUrl() {
        return oauthService.buildAuthorizationUrl(currentUserId());
    }

    /** Completes the QBO OAuth handshake (called from the public callback; userId comes from {@code state}). */
    public void completeOAuth(String code, String realmId, String state) {
        Long userId = Long.valueOf(state);
        oauthService.exchangeCode(userId, code, realmId);
    }

    /**
     * Returns the user's QBO connection. Only the configured demo user is
     * auto-connected to mock QuickBooks; every regular user starts NOT connected
     * (no fabricated data) until they connect real QuickBooks themselves.
     */
    private QboConnection getOrCreateConnection(Long userId) {
        return connectionRepository.findByUserId(userId).orElseGet(() -> {
            if (isDemoUser(userId)) {
                QboConnection connection = new QboConnection(userId);
                connection.setConnected(true);
                connection.setCompanyName(DEFAULT_COMPANY_NAME);
                connection.setRealmId("mock-realm-" + userId);
                connection.setLastSyncAt(LocalDateTime.now());
                return connectionRepository.save(connection);
            }
            // Regular user: transient, not-connected (not persisted, no mock data).
            QboConnection connection = new QboConnection(userId);
            connection.setConnected(false);
            return connection;
        });
    }

    public QboConnection getConnection() {
        return getOrCreateConnection(currentUserId());
    }

    public BusinessDashboardDto getDashboard() {
        Long userId = currentUserId();
        QboConnection connection = getOrCreateConnection(userId);
        if (!connection.isConnected()) {
            // Not connected → no QuickBooks data. The UI derives KPIs from the
            // user's real ledger instead of any fabricated figures.
            return new BusinessDashboardDto(connection.getCompanyName(), false,
                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO,
                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        }
        return dataProvider.getDashboard(userId, connection.getCompanyName(), true);
    }

    public PnlDto getPnl(String period) {
        Long userId = currentUserId();
        QboConnection connection = getOrCreateConnection(userId);
        if (!connection.isConnected()) {
            return new PnlDto(period, List.of(), List.of(),
                    BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO);
        }
        return dataProvider.getPnl(userId, period);
    }

    public List<InvoiceDto> getInvoices() {
        Long userId = currentUserId();
        QboConnection connection = getOrCreateConnection(userId);
        if (!connection.isConnected()) return List.of();
        return dataProvider.getInvoices(userId);
    }

    public List<ExpenseDto> getExpenses() {
        Long userId = currentUserId();
        QboConnection connection = getOrCreateConnection(userId);
        if (!connection.isConnected()) return List.of();
        return dataProvider.getExpenses(userId);
    }

    public QboConnection sync() {
        Long userId = currentUserId();
        QboConnection connection = getOrCreateConnection(userId);
        connection.setLastSyncAt(LocalDateTime.now());
        return connectionRepository.save(connection);
    }

    public QboConnection connect() {
        Long userId = currentUserId();
        // connect() is the mock path (real QBO uses the OAuth redirect via authorizeUrl).
        // In mock mode, only the demo user may fabricate a connection; regular users
        // stay not-connected so they never see mock QuickBooks data.
        if (!qboConfigured() && !isDemoUser(userId)) {
            return getOrCreateConnection(userId);
        }
        QboConnection connection = getOrCreateConnection(userId);
        connection.setConnected(true);
        if (connection.getCompanyName() == null) {
            connection.setCompanyName(DEFAULT_COMPANY_NAME);
        }
        return connectionRepository.save(connection);
    }
}
