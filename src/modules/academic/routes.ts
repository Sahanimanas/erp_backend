import { Router } from 'express';
import academicController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Academic Years
 */

router.post('/years', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.createAcademicYear(req, res);
});

router.get('/years', requireAuth, async (req, res) => {
  await academicController.listAcademicYears(req, res);
});

router.get('/years/:yearId', requireAuth, async (req, res) => {
  await academicController.getAcademicYearById(req, res);
});

router.put('/years/:yearId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.updateAcademicYear(req, res);
});

router.delete('/years/:yearId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.deleteAcademicYear(req, res);
});

/**
 * Classes
 */

router.post('/classes', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.createClass(req, res);
});

router.get('/classes', requireAuth, async (req, res) => {
  await academicController.listClasses(req, res);
});

router.get('/classes/:classId', requireAuth, async (req, res) => {
  await academicController.getClassById(req, res);
});

router.put('/classes/:classId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.updateClass(req, res);
});

router.delete('/classes/:classId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.deleteClass(req, res);
});

/**
 * Sections
 */

router.post('/sections', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.createSection(req, res);
});

router.get('/sections', requireAuth, async (req, res) => {
  await academicController.listSections(req, res);
});

router.get('/sections/:sectionId', requireAuth, async (req, res) => {
  await academicController.getSectionById(req, res);
});

router.put('/sections/:sectionId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.updateSection(req, res);
});

router.delete('/sections/:sectionId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.deleteSection(req, res);
});

/**
 * Subjects
 */

router.post('/subjects', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.createSubject(req, res);
});

router.get('/subjects', requireAuth, async (req, res) => {
  await academicController.listSubjects(req, res);
});

router.get('/subjects/:subjectId', requireAuth, async (req, res) => {
  await academicController.getSubjectById(req, res);
});

router.put('/subjects/:subjectId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.updateSubject(req, res);
});

router.delete('/subjects/:subjectId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.deleteSubject(req, res);
});

/**
 * Class Subjects
 */

router.post('/classes/:classId/subjects/assign', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.assignTeacherToSubject(req, res);
});

router.get('/classes/:classId/subjects', requireAuth, async (req, res) => {
  await academicController.listClassSubjects(req, res);
});

router.delete('/classes/:classId/subjects/:subjectId', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.unassignSubject(req, res);
});

/**
 * Periods (timetable building blocks)
 */

router.get('/periods', requireAuth, async (req, res) => {
  await academicController.listPeriods(req, res);
});

router.post('/periods', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.upsertPeriod(req, res);
});

router.delete('/periods/:id', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.deletePeriod(req, res);
});

/**
 * Timetable
 */

router.get('/classes/:classId/timetable', requireAuth, async (req, res) => {
  await academicController.getClassTimetable(req, res);
});

router.get('/sections/:sectionId/timetable', requireAuth, async (req, res) => {
  await academicController.getSectionTimetable(req, res);
});

router.post('/sections/:sectionId/timetable', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), async (req, res) => {
  await academicController.saveSectionTimetable(req, res);
});

export default router;
