package com.mywealthmanagement.financialcoreservice.clients;

import com.mywealthmanagement.financialcoreservice.clients.dtos.AccountDto;
import com.mywealthmanagement.financialcoreservice.clients.dtos.TransactionDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;

import java.util.List;

@FeignClient(name = "account-aggregation-service", url = "${api-gateway.url}/api/v1/aggregation")
public interface AccountAggregationClient {

    @GetMapping("/accounts")
    List<AccountDto> getAccounts(@RequestHeader("Authorization") String authorizationHeader);

    @GetMapping("/transactions")
    List<TransactionDto> getTransactions(@RequestHeader("Authorization") String authorizationHeader);
}
