package com.mywealthmanagement.authservice.auth;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
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
    private final NotificationClient notificationClient;

    @Value("${otp.expose-dev-code:true}")
    private boolean exposeDevCode;

    @PostMapping("/send")
    public ResponseEntity<Map<String, Object>> send(@RequestBody Map<String, String> body) {
        String phone = body.get("phone");
        if (phone == null || phone.replaceAll("\\D", "").length() < 10) {
            return ResponseEntity.status(HttpStatus.BAD_REQUEST)
                    .body(Map.of("sent", false, "message", "Enter a valid phone number"));
        }
        String code = otpService.generate(phone);
        notificationClient.sendOtp("SMS", phone, code, "phone-verify");
        Map<String, Object> resp = new HashMap<>();
        resp.put("sent", true);
        resp.put("message", "Verification code sent");
        if (exposeDevCode) resp.put("devCode", code); // dev only; false in prod
        return ResponseEntity.ok(resp);
    }

    @PostMapping("/verify")
    public ResponseEntity<Map<String, Object>> verify(@RequestBody Map<String, String> body) {
        boolean ok = otpService.verify(body.get("phone"), body.get("code"));
        return ResponseEntity.ok(Map.of("verified", ok));
    }
}
