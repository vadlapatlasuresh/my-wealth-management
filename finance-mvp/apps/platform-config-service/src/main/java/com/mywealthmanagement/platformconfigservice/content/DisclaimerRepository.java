package com.mywealthmanagement.platformconfigservice.content;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DisclaimerRepository extends JpaRepository<Disclaimer, Long> {
    List<Disclaimer> findByLocale(String locale);

    List<Disclaimer> findByLocaleAndDisclaimerKeyIn(String locale, List<String> keys);
}
