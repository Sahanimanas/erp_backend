import { Request, Response } from 'express';
import { successResponse, errorResponse } from '@common/utils/response';
import service from './service';

/**
 * A SUPER_ADMIN acts as "the platform": it sees every school's threads and its
 * replies are marked as coming from the vendor. Everyone else is pinned to
 * their own school. This one helper is where that decision lives, so no handler
 * can get the scoping subtly different.
 */
const scopeOf = (req: Request) => {
  const isPlatform = req.user?.role === 'SUPER_ADMIN';
  return { isPlatform, schoolId: isPlatform ? undefined : req.user?.schoolId };
};

const authorOf = (req: Request, fromPlatform: boolean) => ({
  id: req.user?.id,
  // The token carries no name, so the role is the honest label to show beside a
  // message rather than inventing one.
  name: fromPlatform ? 'Support team' : (req.user?.role ?? 'School'),
  fromPlatform,
});

export class SupportController {
  async createTicket(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'School context required');
      const ticket = await service.createTicket(schoolId, authorOf(req, false), req.body ?? {});
      successResponse(res, 201, ticket);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Could not send the message');
    }
  }

  async listTickets(req: Request, res: Response): Promise<void> {
    try {
      const { isPlatform, schoolId } = scopeOf(req);
      if (!isPlatform && !schoolId) return void errorResponse(res, 400, 'School context required');
      const rows = await service.listTickets({
        schoolId,
        status: req.query.status as string | undefined,
        type: req.query.type as string | undefined,
      });
      successResponse(res, 200, rows);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Could not load the messages');
    }
  }

  async getTicket(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = scopeOf(req);
      successResponse(res, 200, await service.getTicket(req.params.id, schoolId));
    } catch (e: any) {
      const code = /not found/i.test(e.message) ? 404 : 400;
      errorResponse(res, code, e.message || 'Could not load the message');
    }
  }

  async addReply(req: Request, res: Response): Promise<void> {
    try {
      const { isPlatform, schoolId } = scopeOf(req);
      const reply = await service.addReply(
        req.params.id,
        req.body?.body ?? '',
        authorOf(req, isPlatform),
        schoolId
      );
      successResponse(res, 201, reply);
    } catch (e: any) {
      const code = /not found/i.test(e.message) ? 404 : 400;
      errorResponse(res, code, e.message || 'Could not send the reply');
    }
  }

  async setStatus(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await service.setStatus(req.params.id, String(req.body?.status ?? '')));
    } catch (e: any) {
      const code = /not found/i.test(e.message) ? 404 : 400;
      errorResponse(res, code, e.message || 'Could not update the status');
    }
  }

  async stats(_req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await service.stats());
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Could not load the counts');
    }
  }
}

export default new SupportController();
