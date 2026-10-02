/**
 * Platform billing routes — mounted at /api/v1/platform-billing.
 *
 * Who may do what:
 *   read the QR      any school staff (they are the ones who pay the vendor)
 *   change the QR    SUPER_ADMIN only — it is the vendor's own account detail
 *   report a payment school staff, always against their OWN school
 *   list payments    everyone, but scoped: a super admin sees every tenant,
 *                    a school sees only itself (enforced in the controller)
 *   verify a payment SUPER_ADMIN only — a school confirming its own claim
 *                    would make the status meaningless
 */
import { Router } from 'express';
import { requireAuth, requireRole } from '@common/middleware/auth';
import controller from './controller';

const router = Router();

/** Roles that handle a school's money and would be the ones paying the vendor. */
const SCHOOL_FINANCE = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'] as const;

// ── The company QR ──────────────────────────────────────────────────────────
router.get('/qr', requireAuth, (req, res) => controller.getQr(req, res));
router.put('/qr', requireAuth, requireRole('SUPER_ADMIN'), (req, res) => controller.saveQr(req, res));

// ── Payments a school reports against it ────────────────────────────────────
router.post('/payments', requireAuth, requireRole(...SCHOOL_FINANCE), (req, res) =>
  controller.reportPayment(req, res)
);
router.get('/payments', requireAuth, (req, res) => controller.listPayments(req, res));

// School-wise ledger — the vendor's view of who has paid. Super-admin only:
// it spans every tenant, so no school may ever see it.
router.get('/summary', requireAuth, requireRole('SUPER_ADMIN'), (req, res) =>
  controller.schoolSummary(req, res)
);
router.patch('/payments/:id/status', requireAuth, requireRole('SUPER_ADMIN'), (req, res) =>
  controller.setStatus(req, res)
);

export default router;
