import { Request, Response } from 'express';
import { successResponse, errorResponse } from '@common/utils/response';
import service from './service';

export class PlatformBillingController {
  async getQr(_req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await service.getQr());
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to load the payment QR');
    }
  }

  async saveQr(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await service.saveQr(req.body ?? {}, req.user?.id));
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to save the payment QR');
    }
  }

  async reportPayment(req: Request, res: Response): Promise<void> {
    try {
      // The school is taken from the token, never the body — a school may only
      // ever file a payment against itself.
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School context required');
      successResponse(res, 201, await service.reportPayment(schoolId, req.user?.id, req.body ?? {}));
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to record the payment');
    }
  }

  async listPayments(req: Request, res: Response): Promise<void> {
    try {
      // A super admin may look across tenants (optionally narrowed by
      // ?schoolId); everyone else is pinned to their own school regardless of
      // what they ask for.
      const isPlatform = req.user?.role === 'SUPER_ADMIN';
      const schoolId = isPlatform ? (req.query.schoolId as string | undefined) : req.user?.schoolId;
      if (!isPlatform && !schoolId) return void errorResponse(res, 400, 'School context required');

      const result = await service.listPayments({
        schoolId,
        status: req.query.status as string | undefined,
        from: req.query.from as string | undefined,
        to: req.query.to as string | undefined,
      });
      successResponse(res, 200, result);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to list payments');
    }
  }

  async schoolSummary(_req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await service.schoolSummary());
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to build the school summary');
    }
  }

  async setStatus(req: Request, res: Response): Promise<void> {
    try {
      const { status, months } = req.body ?? {};
      const result = await service.setStatus(req.params.id, String(status ?? ''), Number(months ?? 1));
      // The warning rides in the payload rather than as an error: the status
      // change DID happen, so a 4xx would be a lie.
      successResponse(res, 200, result, result.warning ?? undefined);
    } catch (e: any) {
      const code = /not found/i.test(e.message) ? 404 : 400;
      errorResponse(res, code, e.message || 'Failed to update the payment');
    }
  }
}

export default new PlatformBillingController();
