package com.mywealthmanagement.notificationservice.config;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

import java.util.ArrayList;

@Service
public class UserDetailsServiceImpl implements UserDetailsService {

    // This is a simplified UserDetailsService for internal JWT validation
    // In a real microservice architecture, this would typically fetch user details
    // from a User Management Service or a shared cache.
    // For now, it just creates a dummy user based on the username (which is the userId)
    @Override
    public UserDetails loadUserByUsername(String userId) throws UsernameNotFoundException {
        // Assuming the username in the JWT is the userId (Long)
        // In a real app, you'd fetch actual user details from a DB or another service
        return new org.springframework.security.core.userdetails.User(userId, "", new ArrayList<>());
    }
}
