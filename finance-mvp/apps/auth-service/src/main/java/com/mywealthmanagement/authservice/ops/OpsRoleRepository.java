package com.mywealthmanagement.authservice.ops;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface OpsRoleRepository extends JpaRepository<OpsRoleEntity, String> {

    List<OpsRoleEntity> findByRoleKeyIn(Collection<String> roleKeys);

    List<OpsRoleEntity> findAllByOrderByRoleKeyAsc();
}
