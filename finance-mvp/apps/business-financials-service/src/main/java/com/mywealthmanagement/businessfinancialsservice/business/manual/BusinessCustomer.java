package com.mywealthmanagement.businessfinancialsservice.business.manual;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

/**
 * A reusable customer / contact a business bills. Replaces the previous inline
 * customer-on-invoice model: an invoice may now reference a saved customer while still
 * keeping its own inline snapshot for back-compat (see {@link BusinessInvoice#getCustomerId()}).
 *
 * <p>Holds the details QuickBooks-style order-to-cash needs: contact channels for
 * email/SMS delivery, a tax id, a preferred payment method (drives the default Pay-Now
 * option) and billing / shipping addresses (shipping tax location feeds sales-tax calc).
 *
 * <p>status: ACTIVE | ARCHIVED — archived customers are hidden from pickers but retained
 * so historical invoices keep their link.
 */
@Entity
@Table(name = "business_customers")
@Data
@NoArgsConstructor
public class BusinessCustomer {

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_ARCHIVED = "ARCHIVED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "display_name", nullable = false, length = 200)
    private String displayName;

    @Column(name = "first_name", length = 120)
    private String firstName;

    @Column(name = "last_name", length = 120)
    private String lastName;

    @Column(length = 200)
    private String company;

    @Column(length = 255)
    private String email;

    @Column(length = 40)
    private String phone;

    /** SMS-capable number, preferred when delivering an invoice by text. */
    @Column(length = 40)
    private String mobile;

    @Column(name = "tax_id", length = 60)
    private String taxId;

    /** CARD | ACH | ECHECK | CHECK | CASH | OTHER */
    @Column(name = "preferred_payment_method", length = 24)
    private String preferredPaymentMethod;

    /* ---- Billing address ---- */
    @Column(name = "billing_line1", length = 200)
    private String billingLine1;
    @Column(name = "billing_line2", length = 200)
    private String billingLine2;
    @Column(name = "billing_city", length = 120)
    private String billingCity;
    @Column(name = "billing_region", length = 120)
    private String billingRegion;
    @Column(name = "billing_postal", length = 24)
    private String billingPostal;
    @Column(name = "billing_country", length = 2)
    private String billingCountry;

    /* ---- Shipping address (ignored when shippingSameAsBilling) ---- */
    @Column(name = "shipping_same_as_billing", nullable = false)
    private boolean shippingSameAsBilling = true;
    @Column(name = "shipping_line1", length = 200)
    private String shippingLine1;
    @Column(name = "shipping_line2", length = 200)
    private String shippingLine2;
    @Column(name = "shipping_city", length = 120)
    private String shippingCity;
    @Column(name = "shipping_region", length = 120)
    private String shippingRegion;
    @Column(name = "shipping_postal", length = 24)
    private String shippingPostal;
    @Column(name = "shipping_country", length = 2)
    private String shippingCountry;

    @Column(length = 1000)
    private String notes;

    @Column(nullable = false, length = 16)
    private String status = STATUS_ACTIVE;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
