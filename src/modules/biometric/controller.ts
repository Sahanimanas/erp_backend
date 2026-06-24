import { Request, Response } from 'express';
import biometricService from './service';
import { config } from '@config/environment';
import {
  successResponse,
  errorResponse,
  createdResponse,
  deletedResponse,
  paginatedResponse,
} from '@common/utils/response';

export class BiometricController {
  // ── Devices ───────────────────────────────────────────────────────────────

  async registerDevice(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      const device = await biometricService.registerDevice(schoolId, req.body);
      createdResponse(res, this.withIngestUrl(req, device), 'Device registered');
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to register device');
    }
  }

  async listDevices(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      const devices = await biometricService.listDevices(schoolId);
      successResponse(res, 200, devices.map((d) => this.withIngestUrl(req, d)));
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to list devices');
    }
  }

  async updateDevice(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      const device = await biometricService.updateDevice(schoolId, req.params.id, req.body);
      successResponse(res, 200, this.withIngestUrl(req, device), 'Device updated');
    } catch (e: any) {
      errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to update device');
    }
  }

  async rotateKey(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      const device = await biometricService.rotateKey(schoolId, req.params.id);
      successResponse(res, 200, this.withIngestUrl(req, device), 'API key regenerated');
    } catch (e: any) {
      errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to rotate key');
    }
  }

  async deleteDevice(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      await biometricService.deleteDevice(schoolId, req.params.id);
      deletedResponse(res, 'Device deleted');
    } catch (e: any) {
      errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to delete device');
    }
  }

  // ── Enrollments ─────────────────────────────────────────────────────────────

  async enrollStudent(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      const enrollment = await biometricService.enrollStudent(schoolId, req.body);
      createdResponse(res, enrollment, 'Student enrolled');
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to enroll student');
    }
  }

  async listEnrollments(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      successResponse(res, 200, await biometricService.listEnrollments(schoolId));
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to list enrollments');
    }
  }

  async deleteEnrollment(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      await biometricService.deleteEnrollment(schoolId, req.params.id);
      deletedResponse(res, 'Enrollment removed');
    } catch (e: any) {
      errorResponse(res, e.message?.includes('not found') ? 404 : 400, e.message || 'Failed to remove enrollment');
    }
  }

  // ── Punch log ───────────────────────────────────────────────────────────────

  async listPunches(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await biometricService.listPunches(schoolId, {
        date: req.query.date as string,
        deviceId: req.query.deviceId as string,
        page,
        limit,
      });
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (e: any) {
      errorResponse(res, 400, e.message || 'Failed to list punches');
    }
  }

  // ── Public ingest (device → ERP) ────────────────────────────────────────────

  /**
   * Receives a punch from a biometric device. Authenticates with the device
   * key (header `x-device-key`, `?key=`, or body `key`/`apiKey`). Always
   * answers 200 quickly on success so the device doesn't retry-storm.
   */
  async ingest(req: Request, res: Response): Promise<void> {
    try {
      const key =
        (req.get('x-device-key') as string) ||
        (req.query.key as string) ||
        req.body?.key ||
        req.body?.apiKey;

      const result = await biometricService.ingest(key, req.body);
      // Hikvision expects a fast 200 — keep the body tiny.
      res.status(200).json({ success: true, ...result });
    } catch (e: any) {
      // 401 for bad key so misconfigured devices are diagnosable; 400 otherwise.
      const status = /key/i.test(e.message || '') ? 401 : 400;
      errorResponse(res, status, e.message || 'Ingest failed');
    }
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private withIngestUrl(req: Request, device: any) {
    const base = `${req.protocol}://${req.get('host')}/api/${config.domain.apiVersion}/device/attendance`;
    return { ...device, ingestUrl: base };
  }
}

export default new BiometricController();
