package com.mywealthmanagement.financialcoreservice.goals;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/planning/goals")
@RequiredArgsConstructor
public class GoalController {

    private final GoalService goalService;

    @GetMapping
    public List<GoalDto> list() {
        return goalService.list();
    }

    @PostMapping
    public GoalDto create(@RequestBody GoalDto dto) {
        return goalService.create(dto);
    }

    @PutMapping("/{id}")
    public GoalDto update(@PathVariable Long id, @RequestBody GoalDto dto) {
        return goalService.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        goalService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
