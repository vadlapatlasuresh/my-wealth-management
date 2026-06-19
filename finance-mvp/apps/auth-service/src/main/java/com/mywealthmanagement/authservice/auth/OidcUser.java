package com.mywealthmanagement.authservice.auth;

/** The verified identity extracted from a social (OIDC) ID token. */
public record OidcUser(String email, String name) {}
