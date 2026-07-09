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
 */

export const DESIGNATION_MODULES: string[] = [
  'Home',
  'Employee',
  'Course Management',
  'Time Table',
  'Student',
  'Exam Management',
  'Attendance',
  'Employee Leave',
  'Exam & Holiday',
  'Configuration',
  'Communication',
  'Exam Result Management',
  'Fees Management',
  'Transport Management',
  'Payment',
  'Reports',
  'Finance',
  'Photo Attendance',
  'Employee Salary',
  'Admission',
];
