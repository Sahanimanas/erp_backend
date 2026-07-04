import { Router } from 'express';
import examsController from './controller';
import mgmtController from './mgmtController';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

const ADMIN = ['SCHOOL_ADMIN', 'PRINCIPAL'] as const;
const STAFF = ['SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'] as const;

/**
 * IMPORTANT: literal collection routes MUST be declared before `/:examId`,
 * otherwise Express treats e.g. "grading" as an exam id (see the employee
 * module route-shadowing bug).
 */

// ── Grading scale (Setup Exam Grading) ─────────────────────────────────────
router.get('/grading', requireAuth, async (req, res) => {
  await mgmtController.listGrades(req, res);
});
router.post('/grading', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await mgmtController.saveGrades(req, res);
});
router.delete('/grading/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await mgmtController.deleteGrade(req, res);
});

// ── Exam halls ──────────────────────────────────────────────────────────────
router.get('/halls', requireAuth, async (req, res) => {
  await mgmtController.listHalls(req, res);
});
router.post('/halls', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await mgmtController.upsertHall(req, res);
});
router.delete('/halls/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await mgmtController.deleteHall(req, res);
});

// ── Exam attendance (per schedule row) ─────────────────────────────────────
router.get('/schedule/:scheduleId/attendance', requireAuth, async (req, res) => {
  await mgmtController.getAttendance(req, res);
});
router.post('/schedule/:scheduleId/attendance', requireAuth, requireRole(...STAFF), async (req, res) => {
  await mgmtController.saveAttendance(req, res);
});
router.delete('/schedule/:id', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await mgmtController.deleteScheduleItem(req, res);
});

/**
 * Student Marks
 */

router.post('/marks', requireAuth, requireRole(...STAFF), async (req, res) => {
  await examsController.enterStudentMarks(req, res);
});

/**
 * Performance
 */

router.get('/students/:studentId/performance', requireAuth, async (req, res) => {
  await examsController.getStudentPerformance(req, res);
});

/**
 * Exams
 */

router.post('/', requireAuth, requireRole(...STAFF), async (req, res) => {
  await examsController.createExam(req, res);
});

router.get('/', requireAuth, async (req, res) => {
  await examsController.listExams(req, res);
});

// ── Per-exam management (schedule / status / seating / tickets) ────────────
router.get('/:examId/schedule', requireAuth, async (req, res) => {
  await mgmtController.getSchedule(req, res);
});
router.post('/:examId/schedule', requireAuth, requireRole(...STAFF), async (req, res) => {
  await mgmtController.saveSchedule(req, res);
});
router.patch('/:examId/status', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await mgmtController.setExamStatus(req, res);
});
router.post('/:examId/seating/generate', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await mgmtController.generateSeating(req, res);
});
router.get('/:examId/seating', requireAuth, async (req, res) => {
  await mgmtController.getSeating(req, res);
});
router.get('/:examId/hall-plan', requireAuth, async (req, res) => {
  await mgmtController.hallPlan(req, res);
});
router.get('/:examId/hall-tickets', requireAuth, async (req, res) => {
  await mgmtController.hallTickets(req, res);
});

/**
 * Exam Subjects
 */

router.post('/:examId/subjects', requireAuth, requireRole(...STAFF), async (req, res) => {
  await examsController.addExamSubject(req, res);
});

/**
 * Student Marks / Results & Rankings (per exam)
 */

router.get('/:examId/students/:studentId/marks', requireAuth, async (req, res) => {
  await examsController.getStudentExamMarks(req, res);
});

router.get('/:examId/students/:studentId/result', requireAuth, async (req, res) => {
  await examsController.calculateExamResult(req, res);
});

router.get('/:examId/sections/:sectionId/rankings', requireAuth, async (req, res) => {
  await examsController.getClassRankings(req, res);
});

router.patch('/:examId', requireAuth, requireRole(...STAFF), async (req, res) => {
  await examsController.updateExam(req, res);
});

router.get('/:examId', requireAuth, async (req, res) => {
  await examsController.getExamById(req, res);
});

router.delete('/:examId', requireAuth, requireRole(...ADMIN), async (req, res) => {
  await examsController.deleteExam(req, res);
});

export default router;
