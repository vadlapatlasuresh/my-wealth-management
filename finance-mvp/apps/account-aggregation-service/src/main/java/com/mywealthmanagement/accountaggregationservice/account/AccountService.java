package com.mywealthmanagement.accountaggregationservice.account;

import com.mywealthmanagement.accountaggregationservice.account.dto.AccountDto;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountRepository accountRepository;

    public List<AccountDto> getAccountsByUserId(Long userId) {
        return accountRepository.findByUserId(userId).stream()
                .map(this::convertToDto)
                .collect(Collectors.toList());
    }

    private AccountDto convertToDto(Account account) {
        return new AccountDto(
                account.getId(),
                account.getPlaidAccountId(),
                account.getName(),
                account.getOfficialName(),
                account.getMask(),
                account.getSubtype(),
                account.getType(),
                account.getCurrentBalance(),
                account.getAvailableBalance(),
                account.getCurrency(),
                account.getCreditLimit(),
                account.getLastStatementBalance(),
                account.getMinimumPayment(),
                account.getNextPaymentDueDate(),
                account.getAprPercentage()
        );
    }
}
