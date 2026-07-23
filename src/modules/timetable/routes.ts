import { Router } from 'express';
import timetableController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

// Section timetable — one shared record read by Add / View / Teacher-Allotment.
router.get('/', requireAuth, (req, res) => timetableController.getSectionTimetable(req, res));
router.post('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), (req, res) =>
  timetableController.saveSectionTimetable(req, res),
);

// Cross-cutting views (declared as literal paths — no param collisions).
router.get('/employee', requireAuth, (req, res) => timetableController.getEmployeeTimetable(req, res));
router.get('/session-day', requireAuth, (req, res) => timetableController.getSessionDayTimetable(req, res));

export default router;
