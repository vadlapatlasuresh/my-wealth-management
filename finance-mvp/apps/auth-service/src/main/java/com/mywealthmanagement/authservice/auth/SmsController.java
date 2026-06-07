package com.mywealthmanagement.authservice.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * SMS confirmation endpoints (public, under /api/v1/auth/**).
 *
 * POST /sms/send    {phone}          -> sends an OTP (mock: returns devCode)
 * POST /sms/verify  {phone, code}    -> { verified: true|false }
 */
@RestController
@RequestMapping("/api/v1/auth/sms")
@RequiredArgsConstructor
public class SmsController {

    private final OtpService otpService;

    @PostMapping("/send")
    public ResponseEntity<Map<String, Object>> send(@RequestBody Map<String, String> body) {
        String phone = body.get("phone");
        if (phone == null || phone.replaceAll("\\D", "").length() < 10) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("sent", false, "message", "Enter a valid phone number"));
        }
        String code = otpService.generate(phone);
        // NOTE: devCode is returned only because this is a mock provider. Remove in prod.
        return ResponseEntity.ok(Map.of(
                "sent", true,
                "message", "Verification code sent",
                "devCode", code
        ));
    }

    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(@RequestBody Map<String, String> body) {
        boolean ok = otpService.verify(body.get("phone"), body.get("code"));
        return ResponseEntity.ok(Map.of("verified", ok));
    }
}
