import { Request, Response } from 'express';
import feesService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse } from '@common/utils/response';

export class FeesController {
  async createFeeGroup(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { name } = req.body;

      if (!schoolId || !name) {
        return void errorResponse(res, 400, 'Name is required');
      }

      const group = await feesService.createFeeGroup(schoolId, req.body);
      createdResponse(res, group, 'Fee group created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create fee group');
    }
  }

  async listFeeGroups(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const groups = await feesService.listFeeGroups(schoolId);
      successResponse(res, 200, groups);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list fee groups');
    }
  }

  async createFeeType(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { groupId, name, amount } = req.body;

      if (!schoolId || !groupId || !name || !amount) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const feeType = await feesService.createFeeType(schoolId, req.body);
      createdResponse(res, feeType, 'Fee type created successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to create fee type');
    }
  }

  async listFeeTypes(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const groupId = req.query.groupId as string | undefined;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const types = await feesService.listFeeTypes(schoolId, groupId);
      successResponse(res, 200, types);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list fee types');
    }
  }

  async createFeeStructure(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { sectionId, groupId, dueDate } = req.body;

      if (!schoolId || !sectionId || !groupId || !dueDate) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const fee = await feesService.createFeeStructure(schoolId, req.body);
      createdResponse(res, fee, 'Fee structure created successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to create fee structure');
    }
  }

  async listFees(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const sectionId = req.query.sectionId as string | undefined;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const fees = await feesService.listFees(schoolId, sectionId);
      successResponse(res, 200, fees);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list fees');
    }
  }

  async collectFee(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId, feeId, amount } = req.body;

      if (!schoolId || !studentId || !feeId || !amount) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const collection = await feesService.collectFee(schoolId, req.body);
      createdResponse(res, collection, 'Fee collected successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to collect fee');
    }
  }

  async getStudentDues(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { studentId } = req.params;

      if (!schoolId || !studentId) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const dues = await feesService.getStudentDues(schoolId, studentId);
      successResponse(res, 200, dues);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch dues');
    }
  }

  async getFeeCollectionReport(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { startDate, endDate, sectionId } = req.query;

      if (!schoolId || !startDate || !endDate) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const report = await feesService.getFeeCollectionReport(
        schoolId,
        new Date(startDate as string),
        new Date(endDate as string),
        sectionId as string
      );

      successResponse(res, 200, report);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch report');
    }
  }

  async calculateFine(req: Request, res: Response): Promise<void> {
    try {
      const { feeId } = req.params;
      const { currentDate } = req.query;

      if (!feeId) {
        return void errorResponse(res, 400, 'Fee ID required');
      }

      const fine = await feesService.calculateFine(
        feeId,
        currentDate ? new Date(currentDate as string) : new Date()
      );

      successResponse(res, 200, { fine });
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to calculate fine');
    }
  }

  async getPendingDues(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const result = await feesService.getPendingDues(schoolId, page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch pending dues');
    }
  }
}

export default new FeesController();
