export const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  ASSET_MANAGER: 'ASSET_MANAGER',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  EMPLOYEE: 'EMPLOYEE',
});

/** Roles allowed to manage the asset lifecycle (register, allocate, approve). */
export const MANAGERS = [ROLES.ADMIN, ROLES.ASSET_MANAGER];

/** Roles with organization-wide read visibility (directories, reports, logs). */
export const LEADERSHIP = [ROLES.ADMIN, ROLES.ASSET_MANAGER, ROLES.DEPARTMENT_HEAD];
