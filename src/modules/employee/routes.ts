import { Router } from 'express';
import employeeController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
const ADMIN = ['SCHOOL_ADMIN', 'PRINCIPAL'] as const;

/**
 * Employee Management
 *
 * NOTE: all literal collection routes (/departments, /designations, /import)
 * are declared BEFORE the `/:employeeId` param route so Express does not treat
 * e.g. "departments" as an employee id.
 */

// ── Departments ──────────────────────────────────────────────────────────
router.post('/departments', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.createDepartment(req, res));
router.get('/departments', requireAuth, (req, res) => employeeController.listDepartments(req, res));
router.patch('/departments/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.updateDepartment(req, res));
router.delete('/departments/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deleteDepartment(req, res));

// ── Designations ─────────────────────────────────────────────────────────
router.post('/designations', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.createDesignation(req, res));
router.get('/designations', requireAuth, (req, res) => employeeController.listDesignations(req, res));
router.patch('/designations/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.updateDesignation(req, res));
router.delete('/designations/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deleteDesignation(req, res));

// ── Designation privilege modules (canonical list, backend-owned) ─────────
router.get('/designation-modules', requireAuth, (req, res) => employeeController.listDesignationModules(req, res));

// ── Bulk import ───────────────────────────────────────────────────────────
router.post('/import', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.importEmployees(req, res));

// ── Employees (collection) ────────────────────────────────────────────────
router.post('/', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.createEmployee(req, res));
router.get('/', requireAuth, (req, res) => employeeController.listEmployees(req, res));

// ── Employees (item) ──────────────────────────────────────────────────────
router.get('/:employeeId', requireAuth, (req, res) => employeeController.getEmployeeById(req, res));
router.put('/:employeeId', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.updateEmployee(req, res));
router.patch('/:employeeId/deactivate', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deactivateEmployee(req, res));
router.patch('/:employeeId/activate', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.activateEmployee(req, res));

// ── Leave Management ──────────────────────────────────────────────────────
router.post('/:employeeId/leaves', requireAuth, (req, res) => employeeController.applyLeave(req, res));
router.get('/:employeeId/leaves', requireAuth, (req, res) => employeeController.getEmployeeLeaves(req, res));
router.patch('/:employeeId/leaves/:leaveId/approve', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.approveLeave(req, res));
router.patch('/:employeeId/leaves/:leaveId/reject', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.rejectLeave(req, res));

export default router;
