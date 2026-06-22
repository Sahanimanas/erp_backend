import { Router } from 'express';
import paymentsController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
const COLLECTOR = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'] as const;

// Per-class fee export (declared before /:studentId routes)
router.get('/export', requireAuth, (req, res) => paymentsController.exportClass(req, res));

// Per-class student fee-details summary (last payment, totals, current-month status)
router.get('/fee-details', requireAuth, (req, res) => paymentsController.feeDetails(req, res));

// Late fee rules
router.get('/late-fee-rules', requireAuth, (req, res) => paymentsController.listRules(req, res));
router.post('/late-fee-rules', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.createRule(req, res));
router.patch('/late-fee-rules/:id', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.updateRule(req, res));
router.delete('/late-fee-rules/:id', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), (req, res) => paymentsController.deleteRule(req, res));

// Bulk operations
router.post('/bulk-discount', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.bulkDiscount(req, res));
router.post('/bulk-extra', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.bulkExtra(req, res));

// Collect a payment
router.post('/collect', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.collect(req, res));

// Student ledger + history + installments
router.get('/students/:studentId/ledger', requireAuth, (req, res) => paymentsController.ledger(req, res));
router.get('/students/:studentId/history', requireAuth, (req, res) => paymentsController.history(req, res));
router.get('/students/:studentId/installments', requireAuth, (req, res) => paymentsController.installments(req, res));

// Per-installment adjustments (discount / extra) + delete + receipt revert
router.post('/students/:studentId/adjust', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.adjust(req, res));
router.post('/students/:studentId/delete-installment', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.deleteInstallment(req, res));
router.post('/receipts/:receiptNo/revert', requireAuth, requireRole(...COLLECTOR), (req, res) => paymentsController.revert(req, res));

export default router;
