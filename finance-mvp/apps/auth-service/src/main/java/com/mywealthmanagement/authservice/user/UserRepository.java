package com.mywealthmanagement.authservice.user;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByEmail(String email);

    // Customer-care search by email or name (case-insensitive, paged).
    Page<User> findByEmailContainingIgnoreCaseOrNameContainingIgnoreCase(
            String email, String name, Pageable pageable);

    /**
     * Help-desk multi-field search: first name / last name / email / phone, AND-ed. The caller
     * passes an EMPTY string for any field it doesn't want to filter on (never null — a null bind
     * param is inferred as {@code bytea} by Postgres and breaks {@code lower()}); an empty term
     * becomes {@code like '%%'} which matches everything (including null columns, via coalesce).
     * Phone matches on digits only — stored formatting (spaces, +, -, parentheses) is stripped.
     */
    @Query("select u from User u where "
            + "lower(coalesce(u.firstName, '')) like lower(concat('%', :first, '%')) and "
            + "lower(coalesce(u.lastName,  '')) like lower(concat('%', :last,  '%')) and "
            + "lower(coalesce(u.email,     '')) like lower(concat('%', :email, '%')) and "
            + "replace(replace(replace(replace(replace(coalesce(u.phone, ''), '+', ''), '-', ''), ' ', ''), '(', ''), ')', '') like concat('%', :phone, '%')")
    Page<User> searchAdvanced(@Param("first") String first, @Param("last") String last,
                              @Param("email") String email, @Param("phone") String phone,
                              Pageable pageable);
}
