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
router.get('/departments/:id', requireAuth, (req, res) => employeeController.getDepartment(req, res));
router.patch('/departments/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.updateDepartment(req, res));
router.delete('/departments/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deleteDepartment(req, res));

// ── Designations ─────────────────────────────────────────────────────────
router.post('/designations', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.createDesignation(req, res));
router.get('/designations', requireAuth, (req, res) => employeeController.listDesignations(req, res));
router.patch('/designations/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.updateDesignation(req, res));
router.delete('/designations/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deleteDesignation(req, res));

// ── Designation privilege modules (canonical list, backend-owned) ─────────
router.get('/designation-modules', requireAuth, (req, res) => employeeController.listDesignationModules(req, res));

// ── Leave types & school-wide leave register ─────────────────────────────
// MUST stay above `/:employeeId` — "leave-types" / "leaves" are single path
// segments and would otherwise be read as an employee id.
router.get('/leave-types', requireAuth, (req, res) => employeeController.listLeaveTypes(req, res));
router.post('/leave-types', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.createLeaveType(req, res));
router.patch('/leave-types/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.updateLeaveType(req, res));
router.delete('/leave-types/:id', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deleteLeaveType(req, res));
router.get('/leaves', requireAuth, (req, res) => employeeController.listLeaves(req, res));

// ── Self-service "Apply Leave" (the signed-in employee) ──────────────────
router.get('/me', requireAuth, (req, res) => employeeController.getMyEmployee(req, res));
router.get('/me/leaves', requireAuth, (req, res) => employeeController.getMyLeaves(req, res));
router.get('/me/leave-summary', requireAuth, (req, res) => employeeController.getMyLeaveSummary(req, res));
router.post('/me/leaves', requireAuth, (req, res) => employeeController.applyMyLeave(req, res));
router.get('/me/salary', requireAuth, (req, res) => employeeController.getMySalary(req, res));

// ── Bulk import ───────────────────────────────────────────────────────────
router.post('/import', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.importEmployees(req, res));

// ── Employees (collection) ────────────────────────────────────────────────
router.post('/', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.createEmployee(req, res));
router.get('/', requireAuth, (req, res) => employeeController.listEmployees(req, res));

// ── Employees (item) ──────────────────────────────────────────────────────
router.get('/:employeeId', requireAuth, (req, res) => employeeController.getEmployeeById(req, res));
router.put('/:employeeId', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.updateEmployee(req, res));
// Permanent, unrecoverable. `/deactivate` below only revokes the login.
router.delete('/:employeeId', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deleteEmployee(req, res));
router.patch('/:employeeId/deactivate', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.deactivateEmployee(req, res));
router.patch('/:employeeId/activate', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.activateEmployee(req, res));

// ── Leave Management ──────────────────────────────────────────────────────
router.post('/:employeeId/leaves', requireAuth, (req, res) => employeeController.applyLeave(req, res));
router.get('/:employeeId/leaves', requireAuth, (req, res) => employeeController.getEmployeeLeaves(req, res));
router.get('/:employeeId/leave-balance', requireAuth, (req, res) => employeeController.getLeaveBalance(req, res));
router.patch('/:employeeId/leaves/:leaveId/approve', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.approveLeave(req, res));
router.patch('/:employeeId/leaves/:leaveId/reject', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.rejectLeave(req, res));
router.patch('/:employeeId/leaves/:leaveId/cancel', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.cancelLeave(req, res));

// ── Leave assign (per-employee entitlements) ─────────────────────────────
router.get('/:employeeId/leave-assignments', requireAuth, (req, res) => employeeController.getLeaveAssignments(req, res));
router.put('/:employeeId/leave-assignments', requireAuth, requireRole(...ADMIN), (req, res) => employeeController.saveLeaveAssignments(req, res));
router.get('/:employeeId/leave-summary', requireAuth, (req, res) => employeeController.getLeaveSummary(req, res));

export default router;
