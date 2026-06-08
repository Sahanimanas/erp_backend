import { Router } from 'express';
import attendanceController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Student Attendance
 */

router.post('/students', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req, res) => {
  await attendanceController.markStudentAttendance(req, res);
});

// Bulk mark + daily roster (declared before /students/:studentId to avoid shadowing)
router.post('/students/bulk', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req, res) => {
  await attendanceController.markStudentsBulk(req, res);
});

router.get('/students/daily', requireAuth, async (req, res) => {
  await attendanceController.getStudentsWithStatus(req, res);
});

router.get('/students/:studentId', requireAuth, async (req, res) => {
  await attendanceController.getStudentAttendance(req, res);
});

/**
 * Employee Attendance
 */

router.post('/employees', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await attendanceController.markEmployeeAttendance(req, res);
});

// Bulk mark + daily roster + date-range (declared before /employees/:employeeId)
router.post('/employees/bulk', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await attendanceController.markEmployeesBulk(req, res);
});

router.get('/employees', requireAuth, async (req, res) => {
  await attendanceController.getEmployeesWithStatus(req, res);
});

router.get('/employees-range', requireAuth, async (req, res) => {
  await attendanceController.getEmployeeAttendanceRange(req, res);
});

router.get('/employees/:employeeId', requireAuth, async (req, res) => {
  await attendanceController.getEmployeeAttendance(req, res);
});

/**
 * Reports
 */

router.get('/sections/:sectionId/summary', requireAuth, async (req, res) => {
  await attendanceController.getSectionAttendanceSummary(req, res);
});

router.get('/sections/:sectionId/monthly', requireAuth, async (req, res) => {
  await attendanceController.getMonthlyAttendanceReport(req, res);
});

router.get('/statistics', requireAuth, async (req, res) => {
  await attendanceController.getAttendanceStatistics(req, res);
});

export default router;
