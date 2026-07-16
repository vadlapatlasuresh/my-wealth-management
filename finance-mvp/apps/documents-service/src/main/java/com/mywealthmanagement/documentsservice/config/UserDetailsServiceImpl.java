package com.mywealthmanagement.documentsservice.config;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    // Simplified UserDetailsService for internal JWT validation: the JWT subject is
    // the userId, so we build a principal straight from it (no user DB in this service).
    @Override
    public UserDetails loadUserByUsername(String userId) throws UsernameNotFoundException {
        return new org.springframework.security.core.userdetails.User(userId, "", new ArrayList<>());
    }
}
