/**
 * designationModules.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical list of application privilege modules that a Designation can be
 * granted access to. This is the single source of truth for the "Privileges
 * Details" checklist on the Employee → Designation page.
 *
 * NOTE: this is distinct from PRODUCT_MODULES (constants/modules.ts) which are
 * the billing-level module toggles the Super Admin flips per tenant. These are
 * the finer-grained in-app feature areas a role/designation can reach.
 *
 * IMPORTANT: this list MUST mirror the DISTINCT values of the frontend's
 * MODULE_PRIVILEGE map (routeConfig.js) — those are the ONLY privilege labels
 * `canAccessSection` checks to gate sidebar sections. Any other label is a dead
 * checkbox that grants nothing. The Designation page now derives its checklist
 * from MODULE_PRIVILEGE directly (via DESIGNATION_PRIVILEGES); this constant
 * backs the /employees/designation-modules endpoint and must stay in sync.
 */

export const DESIGNATION_MODULES: string[] = [
  'Home',
  'Student',
  'Employee',
  'Admission',
  'Fees Management',
  'Finance',
  'Payment',
  'Attendance',
  'Photo Attendance',
  'Exam Management',
  'Subject Management',
  'Time Table Management',
  'Reports',
  'Transport Management',
  'Communication',
  'Course Management',
];
