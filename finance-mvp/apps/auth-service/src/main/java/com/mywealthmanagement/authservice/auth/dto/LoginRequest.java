package com.mywealthmanagement.authservice.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor; // Added
import lombok.Data;
import lombok.NoArgsConstructor; // Keep this for other use cases

@Data
@NoArgsConstructor
@AllArgsConstructor // Added
public class LoginRequest {
    @NotBlank(message = "Email cannot be blank")
    @Email(message = "Invalid email format")
    private String email;

    @NotBlank(message = "Password cannot be blank")
    private String password;
}
