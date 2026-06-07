package com.mywealthmanagement.financialcoreservice.clients;

import com.mywealthmanagement.financialcoreservice.clients.dtos.PropertyDto;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;

import java.util.List;

/** Reads the user's real-estate holdings so net worth can include property equity. */
@FeignClient(name = "real-estate-service", url = "${api-gateway.url}/api/v1/real-estate")
public interface RealEstateClient {

    @GetMapping
    List<PropertyDto> getProperties(@RequestHeader("Authorization") String authorizationHeader);
}
