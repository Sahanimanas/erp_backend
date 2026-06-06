import { Router } from 'express';
import timetableController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Periods
 */

router.post('/periods', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await timetableController.createPeriod(req, res);
});

router.get('/periods', requireAuth, async (req, res) => {
  await timetableController.listPeriods(req, res);
});

router.put('/periods/:periodId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await timetableController.updatePeriod(req, res);
});

/**
 * Timetable Slots
 */

router.post('/slots', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await timetableController.createTimetableSlot(req, res);
});

router.put('/slots/:slotId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await timetableController.updateTimetableSlot(req, res);
});

router.delete('/slots/:slotId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await timetableController.deleteTimetableSlot(req, res);
});

/**
 * Timetable Views
 */

router.get('/sections/:sectionId', requireAuth, async (req, res) => {
  await timetableController.getSectionTimetable(req, res);
});

router.get('/teachers/:employeeId', requireAuth, async (req, res) => {
  await timetableController.getTeacherSchedule(req, res);
});

router.get('/classes/:classId', requireAuth, async (req, res) => {
  await timetableController.getClassSchedule(req, res);
});

export default router;
