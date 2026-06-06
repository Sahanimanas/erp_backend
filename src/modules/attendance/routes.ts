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

router.get('/students/:studentId', requireAuth, async (req, res) => {
  await attendanceController.getStudentAttendance(req, res);
});

/**
 * Employee Attendance
 */

router.post('/employees', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await attendanceController.markEmployeeAttendance(req, res);
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
