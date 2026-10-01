import { Router } from 'express';
import contentController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

// Student-facing: content for the logged-in student's section + whole-school.
router.get('/student', requireAuth, (req, res) => contentController.studentList(req, res));

// Admin/teacher: create an item.
router.post('/', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'TEACHER'), (req, res) => contentController.create(req, res));

export default router;
