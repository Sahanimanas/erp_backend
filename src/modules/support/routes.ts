/**
 * Support routes — mounted at /api/v1/support.
 *
 * Who may do what:
 *   raise a thread   school staff, always against their OWN school
 *   list / read      everyone, but scoped: a super admin sees every school,
 *                    a school sees only itself (enforced in the controller)
 *   reply            both sides; the controller marks which side wrote it
 *   change status    SUPER_ADMIN only — status is the vendor's view of the
 *                    work, so a school closing its own ticket would make it
 *                    meaningless
 *   counts           SUPER_ADMIN only — it spans every tenant
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@common/middleware/auth';
import controller from './controller';

const router = Router();

/** Roles that run a school and would be the ones writing in. */
const SCHOOL_STAFF = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'] as const;

router.get('/stats', requireAuth, requireRole('SUPER_ADMIN'), (req, res) => controller.stats(req, res));

router.post('/tickets', requireAuth, requireRole(...SCHOOL_STAFF), (req, res) =>
  controller.createTicket(req, res)
);
router.get('/tickets', requireAuth, (req, res) => controller.listTickets(req, res));
router.get('/tickets/:id', requireAuth, (req, res) => controller.getTicket(req, res));
router.post('/tickets/:id/replies', requireAuth, (req, res) => controller.addReply(req, res));
router.patch('/tickets/:id/status', requireAuth, requireRole('SUPER_ADMIN'), (req, res) =>
  controller.setStatus(req, res)
);

export default router;
