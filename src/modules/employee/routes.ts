import { Router } from 'express';
import employeeController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Employee Management
 */

router.post('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await employeeController.createEmployee(req, res);
});

router.get('/', requireAuth, async (req, res) => {
  await employeeController.listEmployees(req, res);
});

router.get('/:employeeId', requireAuth, async (req, res) => {
  await employeeController.getEmployeeById(req, res);
});

router.put('/:employeeId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await employeeController.updateEmployee(req, res);
});

router.patch('/:employeeId/deactivate', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await employeeController.deactivateEmployee(req, res);
});

/**
 * Departments
 */

router.post('/departments', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await employeeController.createDepartment(req, res);
});

router.get('/departments', requireAuth, async (req, res) => {
  await employeeController.listDepartments(req, res);
});

/**
 * Designations
 */

router.post('/designations', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await employeeController.createDesignation(req, res);
});

router.get('/designations', requireAuth, async (req, res) => {
  await employeeController.listDesignations(req, res);
});

/**
 * Leave Management
 */

router.post('/:employeeId/leaves', requireAuth, async (req, res) => {
  await employeeController.applyLeave(req, res);
});

router.get('/:employeeId/leaves', requireAuth, async (req, res) => {
  await employeeController.getEmployeeLeaves(req, res);
});

router.patch('/:employeeId/leaves/:leaveId/approve', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await employeeController.approveLeave(req, res);
});

router.patch('/:employeeId/leaves/:leaveId/reject', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await employeeController.rejectLeave(req, res);
});

export default router;
