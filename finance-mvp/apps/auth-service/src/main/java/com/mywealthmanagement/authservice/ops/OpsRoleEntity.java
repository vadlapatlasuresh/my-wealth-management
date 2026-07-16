package com.mywealthmanagement.authservice.ops;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.LinkedHashSet;
import java.util.Set;

/**
 * A role: a named, DB-editable bundle of {@link OpsPermission} keys.
 *
 * Roles live in the DB rather than in code so the access matrix can be retuned without a deploy
 * (the same reason payment-service keeps its plan catalog in the DB). The PERMISSIONS themselves
 * are still an enum — a role can only ever be built from keys that some endpoint actually checks.
 */
@Entity
@Table(name = "ops_roles")
@Data
@NoArgsConstructor
public class OpsRoleEntity {

    @Id
    @Column(name = "role_key", length = 64)
    private String roleKey;

    @Column(nullable = false, length = 64)
    private String name;

    @Column(length = 255)
    private String description;

    /** Built-ins ship with the product and cannot be deleted; their permissions can be retuned. */
    @Column(nullable = false)
    private Boolean builtin = false;

    /**
     * Permission keys granted by this role. Stored as raw strings and mapped to
     * {@link OpsPermission} on read, so a key left behind by a removed enum constant degrades to
     * "grants nothing" instead of failing the whole login.
     */
    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "ops_role_permissions", joinColumns = @JoinColumn(name = "role_key"))
    @Column(name = "permission_key", length = 64)
    private Set<String> permissionKeys = new LinkedHashSet<>();
}
