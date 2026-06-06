import { Router } from 'express';
import examsController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Exams
 */

router.post('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req, res) => {
  await examsController.createExam(req, res);
});

router.get('/', requireAuth, async (req, res) => {
  await examsController.listExams(req, res);
});

router.get('/:examId', requireAuth, async (req, res) => {
  await examsController.getExamById(req, res);
});

router.delete('/:examId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await examsController.deleteExam(req, res);
});

/**
 * Exam Subjects
 */

router.post('/:examId/subjects', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req, res) => {
  await examsController.addExamSubject(req, res);
});

/**
 * Student Marks
 */

router.post('/marks', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'), async (req, res) => {
  await examsController.enterStudentMarks(req, res);
});

router.get('/:examId/students/:studentId/marks', requireAuth, async (req, res) => {
  await examsController.getStudentExamMarks(req, res);
});

/**
 * Results & Rankings
 */

router.get('/:examId/students/:studentId/result', requireAuth, async (req, res) => {
  await examsController.calculateExamResult(req, res);
});

router.get('/:examId/sections/:sectionId/rankings', requireAuth, async (req, res) => {
  await examsController.getClassRankings(req, res);
});

/**
 * Performance
 */

router.get('/students/:studentId/performance', requireAuth, async (req, res) => {
  await examsController.getStudentPerformance(req, res);
});

export default router;
