package com.mywealthmanagement.businessfinancialsservice.business;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessDashboardDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.InvoiceDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.PnlDto;
import com.mywealthmanagement.businessfinancialsservice.business.provider.BusinessDataProvider;
import com.mywealthmanagement.businessfinancialsservice.business.provider.QboOAuthService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class BusinessService {

    private static final String DEFAULT_COMPANY_NAME = "Summit Ventures LLC";

    private final QboConnectionRepository connectionRepository;
    private final BusinessDataProvider dataProvider;
    private final QboOAuthService oauthService;

    private Long currentUserId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
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
     * Returns the user's QBO connection, auto-creating a connected mock connection
     * on first access so the demo experience works out of the box.
     */
    private QboConnection getOrCreateConnection(Long userId) {
        return connectionRepository.findByUserId(userId).orElseGet(() -> {
            QboConnection connection = new QboConnection(userId);
            connection.setConnected(true);
            connection.setCompanyName(DEFAULT_COMPANY_NAME);
            connection.setRealmId("mock-realm-" + userId);
            connection.setLastSyncAt(LocalDateTime.now());
            return connectionRepository.save(connection);
        });
    }

    public QboConnection getConnection() {
        return getOrCreateConnection(currentUserId());
    }

    public BusinessDashboardDto getDashboard() {
        Long userId = currentUserId();
        QboConnection connection = getOrCreateConnection(userId);
        return dataProvider.getDashboard(userId, connection.getCompanyName(), connection.isConnected());
    }

    public PnlDto getPnl(String period) {
        Long userId = currentUserId();
        getOrCreateConnection(userId);
        return dataProvider.getPnl(userId, period);
    }

    public List<InvoiceDto> getInvoices() {
        Long userId = currentUserId();
        getOrCreateConnection(userId);
        return dataProvider.getInvoices(userId);
    }

    public List<ExpenseDto> getExpenses() {
        Long userId = currentUserId();
        getOrCreateConnection(userId);
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
        QboConnection connection = getOrCreateConnection(userId);
        connection.setConnected(true);
        if (connection.getCompanyName() == null) {
            connection.setCompanyName(DEFAULT_COMPANY_NAME);
        }
        return connectionRepository.save(connection);
    }
}
