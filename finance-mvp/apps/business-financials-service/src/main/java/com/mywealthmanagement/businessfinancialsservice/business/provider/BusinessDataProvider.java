package com.mywealthmanagement.businessfinancialsservice.business.provider;

import com.mywealthmanagement.businessfinancialsservice.business.dto.BusinessDashboardDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.ExpenseDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.InvoiceDto;
import com.mywealthmanagement.businessfinancialsservice.business.dto.PnlDto;

import java.util.List;

/**
 * Abstraction over a business financials data source (e.g. QuickBooks Online).
 * The default implementation is {@link MockBusinessDataProvider} which returns
 * deterministic, realistic data per userId without any network calls.
 */
public interface BusinessDataProvider {

    BusinessDashboardDto getDashboard(Long userId, String companyName, boolean connected);

    PnlDto getPnl(Long userId, String period);

    List<InvoiceDto> getInvoices(Long userId);

    List<ExpenseDto> getExpenses(Long userId);
}
