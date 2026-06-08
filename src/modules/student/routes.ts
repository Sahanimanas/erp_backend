import { Router } from 'express';
import studentController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Student Management
 */

router.post('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'), async (req, res) => {
  await studentController.createStudent(req, res);
});

router.get('/', requireAuth, async (req, res) => {
  await studentController.listStudents(req, res);
});

// Bulk operations (declared before /:studentId so they aren't treated as an id)
router.post('/promote', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await studentController.promoteStudents(req, res);
});

router.patch('/bulk', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await studentController.bulkUpdateStudents(req, res);
});

router.post('/import', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await studentController.importStudents(req, res);
});

router.get('/:studentId', requireAuth, async (req, res) => {
  await studentController.getStudentById(req, res);
});

router.put('/:studentId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'), async (req, res) => {
  await studentController.updateStudent(req, res);
});

router.patch('/:studentId/deactivate', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await studentController.deactivateStudent(req, res);
});

router.patch('/:studentId/activate', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await studentController.activateStudent(req, res);
});

router.delete('/:studentId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await studentController.deleteStudent(req, res);
});

/**
 * Student Documents
 */

router.post('/:studentId/documents', requireAuth, async (req, res) => {
  await studentController.uploadDocument(req, res);
});

router.get('/:studentId/documents', requireAuth, async (req, res) => {
  await studentController.getStudentDocuments(req, res);
});

router.delete('/:studentId/documents/:documentId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await studentController.deleteDocument(req, res);
});

/**
 * Student Financials & Attendance
 */

router.get('/:studentId/dues', requireAuth, async (req, res) => {
  await studentController.getStudentDues(req, res);
});

router.get('/:studentId/attendance-percentage', requireAuth, async (req, res) => {
  await studentController.getAttendancePercentage(req, res);
});

export default router;
