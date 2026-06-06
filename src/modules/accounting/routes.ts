import { Router } from 'express';
import accountingController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

const FINANCE = ['SCHOOL_ADMIN', 'PRINCIPAL', 'ACCOUNTANT'] as const;

// Accounts
router.get('/accounts', requireAuth, async (req, res) => {
  await accountingController.listAccounts(req, res);
});
router.post('/accounts', requireAuth, requireRole(...FINANCE), async (req, res) => {
  await accountingController.createAccount(req, res);
});

// Voucher heads
router.get('/voucher-heads', requireAuth, async (req, res) => {
  await accountingController.listVoucherHeads(req, res);
});
router.post('/voucher-heads', requireAuth, requireRole(...FINANCE), async (req, res) => {
  await accountingController.createVoucherHead(req, res);
});

// Transactions
router.get('/transactions', requireAuth, async (req, res) => {
  await accountingController.listTransactions(req, res);
});
router.post('/transactions', requireAuth, requireRole(...FINANCE), async (req, res) => {
  await accountingController.createTransaction(req, res);
});

// Summary
router.get('/summary', requireAuth, async (req, res) => {
  await accountingController.getSummary(req, res);
});

export default router;
