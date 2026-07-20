package com.mywealthmanagement.financialcoreservice.clients;

import com.mywealthmanagement.financialcoreservice.clients.dtos.PrivateHoldingSummaryDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;

/** Reads the user's private co-ownership positions so net worth can include them. */
@FeignClient(name = "private-holdings", url = "${api-gateway.url}/api/v1/private-holdings")
public interface PrivateHoldingsClient {

    @GetMapping("/summary")
    PrivateHoldingSummaryDto getSummary(@RequestHeader("Authorization") String authorizationHeader);
}
