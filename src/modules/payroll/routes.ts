import { Router } from 'express';
import payrollController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
/** Salary is a finance operation — accountants can run it alongside admins. */
const FINANCE = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'] as const;

/**
 * Employee Salary Management  (mounted at /api/v1/payroll)
 *
 * Reads are open to any authenticated staff member; every write is limited to
 * FINANCE roles. Literal collection routes are declared before any `/:id`
 * route so a path segment is never mistaken for an id.
 */

// ── Department-wise salary structure ─────────────────────────────────────
router.get('/department-salaries', requireAuth, (req, res) => payrollController.listDepartmentSalaries(req, res));
router.post('/department-salaries', requireAuth, requireRole(...FINANCE), (req, res) => payrollController.saveDepartmentSalary(req, res));
router.delete('/department-salaries/:departmentId', requireAuth, requireRole(...FINANCE), (req, res) => payrollController.deleteDepartmentSalary(req, res));

// ── Salary roster & summary ──────────────────────────────────────────────
router.get('/employees', requireAuth, (req, res) => payrollController.listSalaryEmployees(req, res));
router.get('/summary', requireAuth, (req, res) => payrollController.getSalarySummary(req, res));
router.get('/payment-modes', requireAuth, (req, res) => payrollController.listPaymentModes(req, res));

// ── Salary payments ──────────────────────────────────────────────────────
router.get('/payments', requireAuth, (req, res) => payrollController.listSalaryPayments(req, res));
router.post('/payments', requireAuth, requireRole(...FINANCE), (req, res) => payrollController.createSalaryPayment(req, res));
router.patch('/payments/:id/pay', requireAuth, requireRole(...FINANCE), (req, res) => payrollController.markSalaryPaid(req, res));
router.delete('/payments/:id', requireAuth, requireRole(...FINANCE), (req, res) => payrollController.deleteSalaryPayment(req, res));

export default router;
