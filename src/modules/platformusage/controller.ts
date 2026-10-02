import { Request, Response } from 'express';
import { successResponse, errorResponse } from '@common/utils/response';
import service from './service';

export class PlatformUsageController {
  async whatsappUsage(req: Request, res: Response): Promise<void> {
    try {
      const result = await service.whatsappUsage({
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      successResponse(res, 200, result);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Could not load WhatsApp usage');
    }
  }

  async whatsappDaily(req: Request, res: Response): Promise<void> {
    try {
      const rows = await service.whatsappDaily({
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      successResponse(res, 200, rows);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Could not load the daily trend');
    }
  }
}

export default new PlatformUsageController();
