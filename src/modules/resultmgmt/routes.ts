import { Router } from 'express';
import c from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
const staff = requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER');
const admin = requireRole('SCHOOL_ADMIN', 'PRINCIPAL');

// Exam subject result (single subject) — reads/writes shared StudentMark.
router.get('/exam-result', requireAuth, (req, res) => c.getExamResult(req, res));
router.post('/exam-result', requireAuth, staff, (req, res) => c.saveExamResult(req, res));

// All-subject result grid.
router.get('/all-exam-result', requireAuth, (req, res) => c.getAllExamResult(req, res));
router.post('/all-exam-result', requireAuth, staff, (req, res) => c.saveAllExamResult(req, res));

// Non-subject (per term).
router.get('/nonsubject-result', requireAuth, (req, res) => c.getNonSubjectResult(req, res));
router.post('/nonsubject-result', requireAuth, staff, (req, res) => c.saveNonSubjectResult(req, res));

// Report card remarks.
router.get('/remarks', requireAuth, (req, res) => c.getRemarks(req, res));
router.post('/remarks', requireAuth, staff, (req, res) => c.saveRemarks(req, res));

// Publish exam result.
router.get('/publish-exam', requireAuth, (req, res) => c.getExamPublishStatus(req, res));
router.post('/publish-exam', requireAuth, admin, (req, res) => c.publishExamResult(req, res));

// Report cards.
router.post('/report-cards/generate', requireAuth, admin, (req, res) => c.generateReportCards(req, res));
router.get('/report-cards', requireAuth, (req, res) => c.listReportCards(req, res));
router.post('/report-cards/publish', requireAuth, admin, (req, res) => c.publishReportCards(req, res));

export default router;
