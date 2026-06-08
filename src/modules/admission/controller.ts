import { Request, Response } from 'express';
import admissionService from './service';
import {
  successResponse, errorResponse, createdResponse, paginatedResponse, deletedResponse,
} from '@common/utils/response';

const codeFor = (e: any) => (String(e?.message || '').includes('not found') ? 404 : 400);

export class AdmissionController {
  async createEnquiry(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const enquiry = await admissionService.createEnquiry(schoolId, req.body);
      createdResponse(res, enquiry, 'Enquiry created successfully');
    } catch (e: any) {
      errorResponse(res, codeFor(e), e.message || 'Failed to create enquiry');
    }
  }

  async listEnquiries(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const result = await admissionService.listEnquiries(schoolId, {
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        search: req.query.search as string | undefined,
        status: req.query.status as any,
        classApplying: req.query.classApplying as string | undefined,
        fromDate: req.query.fromDate as string | undefined,
        toDate: req.query.toDate as string | undefined,
      });
      paginatedResponse(res, result.data, result.pagination.page, result.pagination.limit, result.pagination.total);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to list enquiries');
    }
  }

  async getEnquiry(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const enquiry = await admissionService.getEnquiry(schoolId, req.params.id);
      successResponse(res, 200, enquiry);
    } catch (e: any) {
      errorResponse(res, codeFor(e), e.message || 'Failed to fetch enquiry');
    }
  }

  async updateEnquiry(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const enquiry = await admissionService.updateEnquiry(schoolId, req.params.id, req.body);
      successResponse(res, 200, enquiry, 'Enquiry updated successfully');
    } catch (e: any) {
      errorResponse(res, codeFor(e), e.message || 'Failed to update enquiry');
    }
  }

  async deleteEnquiry(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      await admissionService.deleteEnquiry(schoolId, req.params.id);
      deletedResponse(res, 'Enquiry deleted successfully');
    } catch (e: any) {
      errorResponse(res, codeFor(e), e.message || 'Failed to delete enquiry');
    }
  }

  async admitEnquiry(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const result = await admissionService.admitEnquiry(schoolId, req.params.id, req.body);
      successResponse(res, 200, result, 'Applicant admitted as student');
    } catch (e: any) {
      errorResponse(res, codeFor(e), e.message || 'Failed to admit applicant');
    }
  }

  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user!.schoolId;
      const stats = await admissionService.getStats(schoolId);
      successResponse(res, 200, stats);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to fetch stats');
    }
  }
}

export default new AdmissionController();
