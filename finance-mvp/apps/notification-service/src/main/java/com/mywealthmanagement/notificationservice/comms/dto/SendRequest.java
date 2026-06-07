package com.mywealthmanagement.notificationservice.comms.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
public class SendRequest {
    private String templateKey;
    private List<String> channels;   // e.g. ["IN_APP","EMAIL"]; defaults to ["IN_APP"]
    private Map<String, Object> vars;
    private String locale;           // optional; defaults to "en"
    private String idempotencyKey;   // optional
}
