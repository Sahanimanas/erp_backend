import { Request, Response } from 'express';
import noticeService from './service';
import { successResponse, errorResponse, createdResponse } from '@common/utils/response';

const codeFor = (e: any) => (String(e?.message || '').includes('not found') ? 404 : 400);

export class NoticeController {
  async create(req: Request, res: Response): Promise<void> {
    try {
      const n = await noticeService.create(req.user!.schoolId, req.user!.id, req.user!.role, req.body);
      createdResponse(res, n, 'Notice sent');
    } catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async list(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await noticeService.listForUser(req.user!.schoolId, req.user!.id, req.user!.role)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async unread(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await noticeService.unreadCount(req.user!.schoolId, req.user!.id, req.user!.role)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async markRead(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await noticeService.markRead(req.user!.schoolId, req.params.id, req.user!.id)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
  async remove(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await noticeService.remove(req.user!.schoolId, req.params.id, req.user!.id)); }
    catch (e: any) { errorResponse(res, codeFor(e), e.message); }
  }
}
export default new NoticeController();
