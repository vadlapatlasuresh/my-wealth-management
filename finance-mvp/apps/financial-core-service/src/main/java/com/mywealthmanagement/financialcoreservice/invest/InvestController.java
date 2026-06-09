package com.mywealthmanagement.financialcoreservice.invest;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * CRUD for the user's linked brokerage accounts and tracked alternative
 * investments. Backs InvestPage, replacing its previous browser-localStorage
 * storage with real server persistence.
 */
@RestController
@RequestMapping("/api/v1/invest")
@RequiredArgsConstructor
public class InvestController {

    private final BrokerAccountRepository brokerRepo;
    private final AltInvestmentRepository altRepo;

    private Long userId() {
        return Long.valueOf(SecurityContextHolder.getContext().getAuthentication().getName());
    }

    /* ---------------- Brokers ---------------- */

    @GetMapping("/brokers")
    public List<BrokerAccount> listBrokers() {
        return brokerRepo.findByUserIdOrderByLinkedAtDesc(userId());
    }

    @PostMapping("/brokers")
    public BrokerAccount linkBroker(@RequestBody Map<String, Object> body) {
        BrokerAccount b = new BrokerAccount();
        b.setUserId(userId());
        b.setBrokerId(str(body.get("brokerId")));
        b.setName(str(body.get("name")));
        b.setAccountType(str(body.getOrDefault("accountType", "Individual")));
        b.setValue(money(body.getOrDefault("value", 0)));
        b.setConnected(true);
        b.setLinkedAt(LocalDateTime.now());
        if (b.getName() == null || b.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        return brokerRepo.save(b);
    }

    @PostMapping("/brokers/{id}/sync")
    public BrokerAccount syncBroker(@PathVariable Long id) {
        BrokerAccount b = brokerRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        b.setLinkedAt(LocalDateTime.now());
        return brokerRepo.save(b);
    }

    @DeleteMapping("/brokers/{id}")
    public ResponseEntity<Void> deleteBroker(@PathVariable Long id) {
        BrokerAccount b = brokerRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        brokerRepo.delete(b);
        return ResponseEntity.noContent().build();
    }

    /* ---------------- Alternatives ---------------- */

    @GetMapping("/alts")
    public List<AltInvestment> listAlts() {
        return altRepo.findByUserIdOrderByAddedAtDesc(userId());
    }

    @PostMapping("/alts")
    public AltInvestment createAlt(@RequestBody Map<String, Object> body) {
        AltInvestment a = new AltInvestment();
        a.setUserId(userId());
        applyAlt(a, body);
        if (a.getName() == null || a.getName().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "name is required");
        }
        return altRepo.save(a);
    }

    @PutMapping("/alts/{id}")
    public AltInvestment updateAlt(@PathVariable Long id, @RequestBody Map<String, Object> body) {
        AltInvestment a = altRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        applyAlt(a, body);
        return altRepo.save(a);
    }

    @DeleteMapping("/alts/{id}")
    public ResponseEntity<Void> deleteAlt(@PathVariable Long id) {
        AltInvestment a = altRepo.findByIdAndUserId(id, userId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        altRepo.delete(a);
        return ResponseEntity.noContent().build();
    }

    private void applyAlt(AltInvestment a, Map<String, Object> body) {
        if (body.containsKey("type")) a.setType(str(body.get("type")));
        if (body.containsKey("name")) a.setName(str(body.get("name")));
        if (body.containsKey("value")) a.setValue(money(body.get("value")));
        if (body.containsKey("ownershipPct")) a.setOwnershipPct(money(body.get("ownershipPct")));
        if (body.containsKey("notes")) a.setNotes(str(body.get("notes")));
    }

    /* ---------------- helpers ---------------- */

    private String str(Object o) {
        if (o == null) return null;
        String s = o.toString().trim();
        return s.isEmpty() ? null : s;
    }

    private BigDecimal money(Object o) {
        if (o == null) return null;
        String s = o.toString().replace(",", "").trim();
        if (s.isEmpty()) return null;
        try {
            return new BigDecimal(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
