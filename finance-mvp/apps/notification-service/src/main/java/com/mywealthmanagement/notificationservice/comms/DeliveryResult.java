package com.mywealthmanagement.notificationservice.comms;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outcome of a single send attempt on one channel.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DeliveryResult {

    public enum Status { SENT, SKIPPED, FAILED }

    private Channel channel;
    private Status status;
    private String providerRef; // provider-generated reference for SENT, null otherwise
    private String message;     // human-readable detail / reason

    public static DeliveryResult sent(Channel channel, String providerRef, String message) {
        return new DeliveryResult(channel, Status.SENT, providerRef, message);
    }

    public static DeliveryResult skipped(Channel channel, String message) {
        return new DeliveryResult(channel, Status.SKIPPED, null, message);
    }

    public static DeliveryResult failed(Channel channel, String message) {
        return new DeliveryResult(channel, Status.FAILED, null, message);
    }
}
