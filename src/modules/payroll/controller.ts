import { Request, Response } from 'express';
import payrollService from './service';
import { PAYMENT_MODES } from './types';
import { successResponse, createdResponse, deletedResponse, errorResponse, paginatedResponse } from '@common/utils/response';

/** Map a service error to the right status code (same convention as the employee module). */
function fail(res: Response, error: any, fallback: string) {
  const message = error?.message || fallback;
  errorResponse(res, message.includes('not found') ? 404 : 400, message);
}

export class PayrollController {
  /** The payment modes the UI may offer — kept backend-owned so the two never drift. */
  async listPaymentModes(_req: Request, res: Response): Promise<void> {
    successResponse(res, 200, PAYMENT_MODES);
  }

  // ── Department salary structure ────────────────────────────────────────

  async listDepartmentSalaries(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const rows = await payrollService.listDepartmentSalaries(schoolId);
      successResponse(res, 200, rows);
    } catch (error: any) {
      fail(res, error, 'Failed to list department salaries');
    }
  }

  async saveDepartmentSalary(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const saved = await payrollService.saveDepartmentSalary(schoolId, req.body);
      successResponse(res, 200, saved, 'Department salary saved');
    } catch (error: any) {
      fail(res, error, 'Failed to save department salary');
    }
  }

  async deleteDepartmentSalary(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      await payrollService.deleteDepartmentSalary(schoolId, req.params.departmentId);
      deletedResponse(res, 'Department salary removed');
    } catch (error: any) {
      fail(res, error, 'Failed to remove department salary');
    }
  }

  // ── Salary roster ──────────────────────────────────────────────────────

  async listSalaryEmployees(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const { rows, total, page, limit } = await payrollService.listSalaryEmployees(schoolId, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        search: req.query.search as string | undefined,
        departmentId: req.query.departmentId as string | undefined,
        designationId: req.query.designationId as string | undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
      });

      paginatedResponse(res, rows, page, limit, total);
    } catch (error: any) {
      fail(res, error, 'Failed to list employees');
    }
  }

  async getSalarySummary(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const summary = await payrollService.getSalarySummary(
        schoolId,
        req.query.year ? Number(req.query.year) : undefined,
      );
      successResponse(res, 200, summary);
    } catch (error: any) {
      fail(res, error, 'Failed to load salary summary');
    }
  }

  // ── Payments ───────────────────────────────────────────────────────────

  async createSalaryPayment(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const payment = await payrollService.createSalaryPayment(schoolId, req.user?.userId, req.body);
      createdResponse(res, payment, payment.status === 'PAID' ? 'Salary paid' : 'Salary saved');
    } catch (error: any) {
      fail(res, error, 'Failed to record salary payment');
    }
  }

  async listSalaryPayments(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const { rows, total, page, limit } = await payrollService.listSalaryPayments(schoolId, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        search: req.query.search as string | undefined,
        employeeId: req.query.employeeId as string | undefined,
        departmentId: req.query.departmentId as string | undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        month: req.query.month ? Number(req.query.month) : undefined,
        status: req.query.status as string | undefined,
      });

      paginatedResponse(res, rows, page, limit, total);
    } catch (error: any) {
      fail(res, error, 'Failed to list salary payments');
    }
  }

  async markSalaryPaid(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      const payment = await payrollService.markSalaryPaid(schoolId, req.params.id, req.body?.paymentMode);
      successResponse(res, 200, payment, 'Salary paid');
    } catch (error: any) {
      fail(res, error, 'Failed to mark salary as paid');
    }
  }

  async deleteSalaryPayment(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School ID required');

      await payrollService.deleteSalaryPayment(schoolId, req.params.id);
      deletedResponse(res, 'Salary payment deleted');
    } catch (error: any) {
      fail(res, error, 'Failed to delete salary payment');
    }
  }
}

export default new PayrollController();
