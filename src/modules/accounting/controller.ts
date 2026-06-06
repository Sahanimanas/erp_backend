import { Request, Response } from 'express';
import accountingService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse } from '@common/utils/response';

export class AccountingController {
  // ── Accounts ──
  async createAccount(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId || !req.body.name) return void errorResponse(res, 400, 'Account name is required');
      const account = await accountingService.createAccount(schoolId, req.body);
      createdResponse(res, account, 'Account created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create account');
    }
  }

  async listAccounts(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');
      const accounts = await accountingService.listAccounts(schoolId);
      successResponse(res, 200, accounts);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list accounts');
    }
  }

  // ── Voucher Heads ──
  async createVoucherHead(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name, type } = req.body;
      if (!schoolId || !name || !type) return void errorResponse(res, 400, 'Name and type are required');
      const vh = await accountingService.createVoucherHead(schoolId, req.body);
      createdResponse(res, vh, 'Voucher head created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create voucher head');
    }
  }

  async listVoucherHeads(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');
      const type = req.query.type as any;
      const heads = await accountingService.listVoucherHeads(schoolId, type);
      successResponse(res, 200, heads);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list voucher heads');
    }
  }

  // ── Transactions ──
  async createTransaction(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { accountId, type, amount } = req.body;
      if (!schoolId || !accountId || !type || !amount) return void errorResponse(res, 400, 'Account, type and amount are required');
      const txn = await accountingService.createTransaction(schoolId, req.user?.userId, req.body);
      createdResponse(res, txn, 'Transaction recorded successfully');
    } catch (error: any) {
      const code = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, code, error.message || 'Failed to record transaction');
    }
  }

  async listTransactions(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;
      const type = req.query.type as any;
      const accountId = req.query.accountId as string | undefined;
      const result = await accountingService.listTransactions(schoolId, page, limit, { type, accountId });
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list transactions');
    }
  }

  async getSummary(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');
      const { startDate, endDate } = req.query;
      const summary = await accountingService.getSummary(
        schoolId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );
      successResponse(res, 200, summary);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to load summary');
    }
  }
}

export default new AccountingController();
