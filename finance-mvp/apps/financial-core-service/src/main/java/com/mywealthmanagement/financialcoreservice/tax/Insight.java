package com.mywealthmanagement.financialcoreservice.tax;

/**
 * One educational tax insight (deduction/credit finder output).
 * @param type   TIP | OPPORTUNITY | WARNING | INFO  (drives the UI icon/color)
 * @param title  short headline
 * @param detail plain-English explanation
 */
public record Insight(String type, String title, String detail) {}
