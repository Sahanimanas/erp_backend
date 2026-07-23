import { Router } from 'express';
import c from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
const admin = requireRole('SCHOOL_ADMIN', 'PRINCIPAL');

// Sessions
router.get('/sessions', requireAuth, (req, res) => c.listSessions(req, res));
router.post('/sessions', requireAuth, admin, (req, res) => c.saveSession(req, res));
router.patch('/sessions/:id/active', requireAuth, admin, (req, res) => c.setActiveSession(req, res));
router.delete('/sessions/:id', requireAuth, admin, (req, res) => c.deleteSession(req, res));

// Classes
router.get('/classes', requireAuth, (req, res) => c.listClasses(req, res));
router.post('/classes', requireAuth, admin, (req, res) => c.saveClass(req, res));
router.delete('/classes/:id', requireAuth, admin, (req, res) => c.deleteClass(req, res));

// Class details
router.get('/class-details', requireAuth, (req, res) => c.getClassDetails(req, res));
router.post('/class-details', requireAuth, admin, (req, res) => c.saveClassDetails(req, res));

// Subjects
router.get('/subjects', requireAuth, (req, res) => c.listClassSubjects(req, res));
router.post('/subjects', requireAuth, admin, (req, res) => c.saveClassSubject(req, res));

// Non-subjects
router.get('/non-subjects', requireAuth, (req, res) => c.listNonSubjects(req, res));
router.post('/non-subjects', requireAuth, admin, (req, res) => c.saveNonSubject(req, res));

// Syllabus
router.get('/syllabus', requireAuth, (req, res) => c.listSyllabus(req, res));
router.get('/syllabus/:id', requireAuth, (req, res) => c.getSyllabus(req, res));
router.post('/syllabus', requireAuth, admin, (req, res) => c.saveSyllabus(req, res));
router.delete('/syllabus/:id', requireAuth, admin, (req, res) => c.deleteSyllabus(req, res));

// Employee ↔ subject mapping
router.get('/employee-mapping', requireAuth, (req, res) => c.getEmployeeMapping(req, res));
router.post('/employee-mapping', requireAuth, admin, (req, res) => c.saveEmployeeMapping(req, res));

export default router;
