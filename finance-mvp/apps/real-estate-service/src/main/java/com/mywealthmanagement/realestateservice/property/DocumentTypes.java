package com.mywealthmanagement.realestateservice.property;

import java.util.List;

/**
 * The suggested document types for a property's vault. Kept server-side so the UI picker
 * and any reporting share one list. Custom/unknown values are tolerated (stored as-is);
 * this is a suggestion list, not a closed enum.
 */
public final class DocumentTypes {

    public static final List<String> ALL = List.of(
            "RECEIPT",          // an expense receipt / invoice image
            "FORM_1098",        // mortgage interest statement
            "INSURANCE",        // policy / declarations page
            "HOA",              // HOA statement / dues
            "TAX_ASSESSMENT",   // county tax assessment
            "MORTGAGE",         // mortgage / loan statement
            "OTHER"
    );

    private DocumentTypes() {
    }
}
