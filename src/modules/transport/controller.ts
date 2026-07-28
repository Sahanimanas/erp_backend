import { Request, Response } from 'express';
import transportService from './service';
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
  if (m.includes('Unique constraint')) return 'A record with these details already exists';
  if (m.includes('Invalid `prisma')) return 'Could not save — please check the details and try again';
  return m;
};

export class TransportController {
  // ── Vehicles ──────────────────────────────────────────────────────────────
  async listVehicles(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await transportService.listVehicles(req.user!.schoolId));
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async upsertVehicle(req: Request, res: Response): Promise<void> {
    try {
      const data = await transportService.upsertVehicle(req.user!.schoolId, req.body);
      successResponse(res, 200, data, 'Vehicle saved');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async deleteVehicle(req: Request, res: Response): Promise<void> {
    try {
      await transportService.deleteVehicle(req.user!.schoolId, req.params.id);
      deletedResponse(res, 'Vehicle deleted');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  // ── Drivers ───────────────────────────────────────────────────────────────
  async listDrivers(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await transportService.listDrivers(req.user!.schoolId));
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async upsertDriver(req: Request, res: Response): Promise<void> {
    try {
      const data = await transportService.upsertDriver(req.user!.schoolId, req.body);
      successResponse(res, 200, data, 'Driver saved');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async deleteDriver(req: Request, res: Response): Promise<void> {
    try {
      await transportService.deleteDriver(req.user!.schoolId, req.params.id);
      deletedResponse(res, 'Driver deleted');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  // ── Stoppages ─────────────────────────────────────────────────────────────
  async listStoppages(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await transportService.listStoppages(req.user!.schoolId));
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async upsertStoppage(req: Request, res: Response): Promise<void> {
    try {
      const data = await transportService.upsertStoppage(req.user!.schoolId, req.body);
      successResponse(res, 200, data, 'Stoppage saved');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async deleteStoppage(req: Request, res: Response): Promise<void> {
    try {
      await transportService.deleteStoppage(req.user!.schoolId, req.params.id);
      deletedResponse(res, 'Stoppage deleted');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  async listRoutes(req: Request, res: Response): Promise<void> {
    try {
      successResponse(res, 200, await transportService.listRoutes(req.user!.schoolId));
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async upsertRoute(req: Request, res: Response): Promise<void> {
    try {
      const data = await transportService.upsertRoute(req.user!.schoolId, req.body);
      successResponse(res, 200, data, 'Route saved');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async deleteRoute(req: Request, res: Response): Promise<void> {
    try {
      await transportService.deleteRoute(req.user!.schoolId, req.params.id);
      deletedResponse(res, 'Route deleted');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  // ── Route ↔ stoppage ──────────────────────────────────────────────────────
  async listRouteStoppages(req: Request, res: Response): Promise<void> {
    try {
      const routeId = req.query.routeId as string | undefined;
      successResponse(res, 200, await transportService.listRouteStoppages(req.user!.schoolId, routeId));
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async addRouteStoppage(req: Request, res: Response): Promise<void> {
    try {
      const data = await transportService.addRouteStoppage(req.user!.schoolId, req.body);
      createdResponse(res, data, 'Stoppage assigned to route');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async deleteRouteStoppage(req: Request, res: Response): Promise<void> {
    try {
      await transportService.deleteRouteStoppage(req.user!.schoolId, req.params.id);
      deletedResponse(res, 'Stoppage removed from route');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  // ── Route ↔ student ───────────────────────────────────────────────────────
  async listStudentRoutes(req: Request, res: Response): Promise<void> {
    try {
      const routeId = req.query.routeId as string | undefined;
      successResponse(res, 200, await transportService.listStudentRoutes(req.user!.schoolId, routeId));
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async assignStudents(req: Request, res: Response): Promise<void> {
    try {
      const data = await transportService.assignStudents(req.user!.schoolId, req.body);
      successResponse(res, 200, data, `${data.assigned} student(s) assigned`);
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  async unassignStudent(req: Request, res: Response): Promise<void> {
    try {
      await transportService.unassignStudent(req.user!.schoolId, req.params.id);
      deletedResponse(res, 'Student unassigned');
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }

  // ── Report ────────────────────────────────────────────────────────────────
  async studentReport(req: Request, res: Response): Promise<void> {
    try {
      const data = await transportService.studentReport(req.user!.schoolId, {
        routeId: req.query.routeId as string | undefined,
        stoppageId: req.query.stoppageId as string | undefined,
      });
      successResponse(res, 200, data);
    } catch (e: any) { errorResponse(res, codeFor(e), msgFor(e)); }
  }
}

export default new TransportController();
