import { Request, Response } from 'express';
import paymentsService from './service';
import { successResponse, errorResponse, createdResponse, deletedResponse } from '@common/utils/response';

const codeFor = (e: any) => (String(e?.message || '').includes('not found') ? 404 : 400);

export class PaymentsController {
  async ledger(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.getStudentLedger(req.user!.schoolId, req.params.studentId);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async collect(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.collect(req.user!.schoolId, { ...req.body, createdBy: req.user!.id });
      createdResponse(res, data, `Payment recorded (${data.receiptNo})`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async history(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.getHistory(req.user!.schoolId, req.params.studentId);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async installments(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.getInstallments(req.user!.schoolId, req.params.studentId);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async adjust(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.adjustInstallment(req.user!.schoolId, { ...req.body, studentId: req.params.studentId });
      successResponse(res, 200, data, 'Adjustment applied');
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async deleteInstallment(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.deleteInstallmentPayments(req.user!.schoolId, { ...req.body, studentId: req.params.studentId });
      successResponse(res, 200, data, 'Payment deleted');
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async revert(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.revertReceipt(req.user!.schoolId, req.params.receiptNo);
      successResponse(res, 200, data, 'Receipt reverted');
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async exportClass(req: Request, res: Response): Promise<void> {
    try {
      const { classId } = req.query;
      if (!classId) return void errorResponse(res, 400, 'classId is required');
      const data = await paymentsService.exportClassFees(req.user!.schoolId, classId as string);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async monthlyDues(req: Request, res: Response): Promise<void> {
    try {
      const { classId, month } = req.query;
      if (!classId) return void errorResponse(res, 400, 'classId is required');
      const data = await paymentsService.classMonthlyDues(req.user!.schoolId, classId as string, (month as string) || undefined);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async feeDetails(req: Request, res: Response): Promise<void> {
    try {
      const { classId } = req.query;
      if (!classId) return void errorResponse(res, 400, 'classId is required');
      const data = await paymentsService.feeDetails(req.user!.schoolId, classId as string);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async bulkDiscount(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.bulkApply(req.user!.schoolId, 'DISCOUNT', req.body);
      successResponse(res, 200, data, `Discount applied to ${data.applied} student(s)`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async bulkExtra(req: Request, res: Response): Promise<void> {
    try {
      const data = await paymentsService.bulkApply(req.user!.schoolId, 'EXTRA', req.body);
      successResponse(res, 200, data, `Extra fee added to ${data.applied} student(s)`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async listRules(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await paymentsService.listLateFeeRules(req.user!.schoolId)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async createRule(req: Request, res: Response): Promise<void> {
    try { createdResponse(res, await paymentsService.createLateFeeRule(req.user!.schoolId, req.body), 'Rule created'); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async updateRule(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await paymentsService.updateLateFeeRule(req.user!.schoolId, req.params.id, req.body), 'Rule updated'); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async deleteRule(req: Request, res: Response): Promise<void> {
    try { await paymentsService.deleteLateFeeRule(req.user!.schoolId, req.params.id); deletedResponse(res, 'Rule deleted'); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
}

export default new PaymentsController();
