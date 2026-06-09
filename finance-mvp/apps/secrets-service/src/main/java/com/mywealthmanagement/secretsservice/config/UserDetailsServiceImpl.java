package com.mywealthmanagement.secretsservice.config;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    // The JWT subject is the userId; build a minimal UserDetails from it (no DB lookup).
    @Override
    public UserDetails loadUserByUsername(String userId) throws UsernameNotFoundException {
        return new org.springframework.security.core.userdetails.User(userId, "", new ArrayList<>());
    }
}
