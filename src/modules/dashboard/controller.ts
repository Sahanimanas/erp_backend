import { Request, Response } from 'express';
import dashboardService from './service';
import { successResponse, errorResponse } from '@common/utils/response';

export class DashboardController {
  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID required');
      }

      const stats = await dashboardService.getStats(schoolId);
      successResponse(res, 200, stats);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch dashboard stats');
    }
  }
}

export default new DashboardController();
