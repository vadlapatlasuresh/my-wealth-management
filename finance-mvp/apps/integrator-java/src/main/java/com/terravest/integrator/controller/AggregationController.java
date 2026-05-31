package com.terravest.integrator.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
public class AggregationController {

  @GetMapping("/internal/aggregate/accounts")
  public ResponseEntity<Map<String, Object>> getMockAccounts(
      @RequestHeader(value = "x-integrator-key", required = false) String key,
      @RequestParam(required = false) String userId) {

    String expected = System.getenv("INTEGRATOR_KEY");
    if (expected == null || expected.isEmpty()) expected = "dev-integrator-key";

    if (key == null || !key.equals(expected)) {
      Map<String, Object> err = new HashMap<>();
      err.put("error", "unauthorized");
      err.put("message", "Missing or invalid integrator key");
      return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(err);
    }

    List<Map<String, Object>> items = new ArrayList<>();
    Map<String, Object> acc = new HashMap<>();
    acc.put("id", "acc-java-1");
    acc.put("userId", userId == null ? "demo" : userId);
    acc.put("institution", "BankJava");
    acc.put("name", "Primary Checking");
    acc.put("type", "CHECKING");
    acc.put("balance", 12345.67);
    acc.put("available", 12000.12);
    acc.put("status", "HEALTHY");
    acc.put("lastSynced", Instant.now().toString());
    items.add(acc);

    Map<String, Object> resp = new HashMap<>();
    resp.put("items", items);
    return ResponseEntity.ok(resp);
  }
}
