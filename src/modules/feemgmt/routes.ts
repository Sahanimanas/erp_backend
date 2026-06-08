import { Router } from 'express';
import feeMgmtController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
const ADMIN = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'] as const;

// Fee types (class + transport, filtered by ?isTransport=true|false)
router.get('/fee-types', requireAuth, (req, res) => feeMgmtController.listFeeTypes(req, res));
router.post('/fee-types', requireAuth, requireRole(...ADMIN), (req, res) => feeMgmtController.createFeeType(req, res));
router.patch('/fee-types/:id', requireAuth, requireRole(...ADMIN), (req, res) => feeMgmtController.updateFeeType(req, res));
router.delete('/fee-types/:id', requireAuth, requireRole('SCHOOL_ADMIN', 'PRINCIPAL'), (req, res) => feeMgmtController.deleteFeeType(req, res));

// Per-class fee structure
router.get('/structure', requireAuth, (req, res) => feeMgmtController.getClassStructure(req, res));
router.post('/structure', requireAuth, requireRole(...ADMIN), (req, res) => feeMgmtController.saveClassStructure(req, res));

// Transport routes + route fee
router.get('/routes', requireAuth, (req, res) => feeMgmtController.listRoutes(req, res));
router.post('/routes', requireAuth, requireRole(...ADMIN), (req, res) => feeMgmtController.upsertRoute(req, res));

// Income heads (dropdown source)
router.get('/income-heads', requireAuth, (req, res) => feeMgmtController.incomeHeads(req, res));

export default router;
