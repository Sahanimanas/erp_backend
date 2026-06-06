import { Router } from 'express';
import feesController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Fee Groups
 */

router.post('/groups', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'), async (req, res) => {
  await feesController.createFeeGroup(req, res);
});

router.get('/groups', requireAuth, async (req, res) => {
  await feesController.listFeeGroups(req, res);
});

/**
 * Fee Types
 */

router.post('/types', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'), async (req, res) => {
  await feesController.createFeeType(req, res);
});

router.get('/types', requireAuth, async (req, res) => {
  await feesController.listFeeTypes(req, res);
});

/**
 * Fee Structures
 */

router.post('/structures', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'), async (req, res) => {
  await feesController.createFeeStructure(req, res);
});

router.get('/structures', requireAuth, async (req, res) => {
  await feesController.listFees(req, res);
});

/**
 * Fee Collections
 */

router.post('/collections', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'), async (req, res) => {
  await feesController.collectFee(req, res);
});

/**
 * Dues & Reports
 */

router.get('/students/:studentId/dues', requireAuth, async (req, res) => {
  await feesController.getStudentDues(req, res);
});

router.get('/pending-dues', requireAuth, async (req, res) => {
  await feesController.getPendingDues(req, res);
});

router.get('/reports/collection', requireAuth, async (req, res) => {
  await feesController.getFeeCollectionReport(req, res);
});

router.get('/:feeId/calculate-fine', requireAuth, async (req, res) => {
  await feesController.calculateFine(req, res);
});

export default router;
