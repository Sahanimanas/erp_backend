import { Request, Response } from 'express';
import feeMgmtService from './service';
import { successResponse, errorResponse, createdResponse, deletedResponse } from '@common/utils/response';

const codeFor = (e: any) => {
  const m = String(e?.message || '');
  if (m.includes('not found')) return 404;
  if (m.includes('already') || m.includes('Unique constraint')) return 409;
  return 400;
};

/** Never surface raw Prisma invocation text to the user. */
const msgFor = (e: any) => {
  const m = String(e?.message || 'Something went wrong');
  if (m.includes('Unique constraint')) return 'A fee type with this name already exists';
  if (m.includes('Invalid `prisma')) return 'Could not save — please check the details and try again';
  return m;
};

export class FeeMgmtController {
  async listFeeTypes(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const isTransport = req.query.isTransport === undefined ? undefined : req.query.isTransport === 'true';
      const data = await feeMgmtService.listFeeTypes(schoolId, isTransport);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async createFeeType(req: Request, res: Response): Promise<void> {
    try {
      const data = await feeMgmtService.createFeeType(req.user!.schoolId, req.body);
      createdResponse(res, data, 'Fee type created');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async updateFeeType(req: Request, res: Response): Promise<void> {
    try {
      const data = await feeMgmtService.updateFeeType(req.user!.schoolId, req.params.id, req.body);
      successResponse(res, 200, data, 'Fee type updated');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async deleteFeeType(req: Request, res: Response): Promise<void> {
    try {
      await feeMgmtService.deleteFeeType(req.user!.schoolId, req.params.id);
      deletedResponse(res, 'Fee type deleted');
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async getClassStructure(req: Request, res: Response): Promise<void> {
    try {
      const { classId, academicYearId } = req.query;
      if (!classId) return void errorResponse(res, 400, 'classId is required');
      const includeTransport = req.query.includeTransport === 'true';
      const data = await feeMgmtService.getClassStructure(req.user!.schoolId, classId as string, includeTransport, academicYearId as string | undefined);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async saveClassStructure(req: Request, res: Response): Promise<void> {
    try {
      const { classId, items, academicYearId } = req.body;
      const data = await feeMgmtService.saveClassStructure(req.user!.schoolId, classId, items, academicYearId);
      successResponse(res, 200, data, `Saved ${data.saved} fee row(s)`);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async listRoutes(req: Request, res: Response): Promise<void> {
    try {
      const data = await feeMgmtService.listRoutes(req.user!.schoolId);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async upsertRoute(req: Request, res: Response): Promise<void> {
    try {
      const data = await feeMgmtService.upsertRoute(req.user!.schoolId, req.body);
      successResponse(res, 200, data, 'Route saved');
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }

  async incomeHeads(req: Request, res: Response): Promise<void> {
    try {
      const data = await feeMgmtService.incomeHeads(req.user!.schoolId);
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
}

export default new FeeMgmtController();
