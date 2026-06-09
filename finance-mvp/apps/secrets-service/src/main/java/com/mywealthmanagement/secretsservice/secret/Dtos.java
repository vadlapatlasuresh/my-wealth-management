package com.mywealthmanagement.secretsservice.secret;

import java.time.Instant;

/** Request/response shapes for the secret APIs. */
public class Dtos {

    /** Create or rotate request (admin). */
    public record SecretWriteRequest(String name, String scope, String description,
                                     Integer rotationDays, String value) {}

    /** Metadata view — NEVER contains the value. */
    public record SecretMetadata(String name, String scope, String description,
                                 Integer rotationDays, Integer activeVersion,
                                 String status, Instant updatedAt) {}
}
