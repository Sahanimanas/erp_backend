/**
 * modules.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Canonical list of toggleable product modules. The Super Admin enables/disables
 * these per tenant via School.enabledModules (an empty array means "all enabled",
 * so existing schools are unaffected by the column being added).
 *
 * Keep keys in sync with the frontend module list shown on the School Details →
 * Modules tab.
 */

export interface ModuleDef {
  key: string;
  label: string;
  description: string;
}

export const PRODUCT_MODULES: ModuleDef[] = [
  { key: 'attendance', label: 'Attendance', description: 'Student & staff attendance, reports' },
  { key: 'fees', label: 'Fees', description: 'Fee structure, collection, receipts' },
  { key: 'exams', label: 'Examinations', description: 'Exams, marks, report cards' },
  { key: 'library', label: 'Library', description: 'Books, issue/return' },
  { key: 'transport', label: 'Transport', description: 'Routes, drivers, assignments' },
  { key: 'hr', label: 'HR / Payroll', description: 'Employees, leaves, payroll' },
  { key: 'inventory', label: 'Inventory', description: 'Products, stock, purchases' },
  { key: 'hostel', label: 'Hostel', description: 'Rooms, allocation, hostel fees' },
  { key: 'communication', label: 'Communication', description: 'Bulk SMS, email, announcements' },
];

export const MODULE_KEYS = PRODUCT_MODULES.map((m) => m.key);

/**
 * A school has a module enabled when its enabledModules list is empty (legacy /
 * "all on" default) or explicitly contains the key.
 */
export const isModuleEnabled = (
  enabledModules: string[] | null | undefined,
  key: string
): boolean => {
  if (!enabledModules || enabledModules.length === 0) return true;
  return enabledModules.includes(key);
};
