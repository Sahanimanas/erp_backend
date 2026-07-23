import { Request, Response } from 'express';
import svc from './service';
import { successResponse, errorResponse } from '@common/utils/response';

const sid = (req: Request) => req.user?.schoolId as string;
const ok = (res: Response, data: any, msg?: string) => successResponse(res, 200, data, msg);
const fail = (res: Response, e: any) => errorResponse(res, 400, e.message || 'Request failed');
const q = (req: Request, k: string) => (req.query[k] as string) || '';

export class ResultMgmtController {
  async getExamResult(req: Request, res: Response) {
    try { ok(res, await svc.getExamResult(sid(req), q(req, 'examId'), q(req, 'sectionId'), q(req, 'subjectId'), q(req, 'sortBy') || 'Name')); } catch (e) { fail(res, e); }
  }
  async saveExamResult(req: Request, res: Response) {
    try { ok(res, await svc.saveExamResult(sid(req), req.body), 'Saved'); } catch (e) { fail(res, e); }
  }
  async getAllExamResult(req: Request, res: Response) {
    try { ok(res, await svc.getAllExamResult(sid(req), q(req, 'examId'), q(req, 'sectionId'), q(req, 'sortBy') || 'Name')); } catch (e) { fail(res, e); }
  }
  async saveAllExamResult(req: Request, res: Response) {
    try { ok(res, await svc.saveAllExamResult(sid(req), req.body), 'Saved'); } catch (e) { fail(res, e); }
  }
  async getNonSubjectResult(req: Request, res: Response) {
    try { ok(res, await svc.getNonSubjectResult(sid(req), q(req, 'sectionId'), q(req, 'term'), q(req, 'sortBy') || 'Name')); } catch (e) { fail(res, e); }
  }
  async saveNonSubjectResult(req: Request, res: Response) {
    try { ok(res, await svc.saveNonSubjectResult(sid(req), req.body), 'Saved'); } catch (e) { fail(res, e); }
  }
  async getRemarks(req: Request, res: Response) {
    try { ok(res, await svc.getRemarks(sid(req), q(req, 'sectionId'), q(req, 'academicYearId') || null, q(req, 'term'), q(req, 'sortBy') || 'Name')); } catch (e) { fail(res, e); }
  }
  async saveRemarks(req: Request, res: Response) {
    try { ok(res, await svc.saveRemarks(sid(req), req.body), 'Saved'); } catch (e) { fail(res, e); }
  }
  async getExamPublishStatus(req: Request, res: Response) {
    try { ok(res, await svc.getExamPublishStatus(sid(req), q(req, 'examId'), q(req, 'sectionId'), q(req, 'sortBy') || 'Name')); } catch (e) { fail(res, e); }
  }
  async publishExamResult(req: Request, res: Response) {
    try { ok(res, await svc.publishExamResult(sid(req), req.body)); } catch (e) { fail(res, e); }
  }
  async generateReportCards(req: Request, res: Response) {
    try { ok(res, await svc.generateReportCards(sid(req), req.body)); } catch (e) { fail(res, e); }
  }
  async listReportCards(req: Request, res: Response) {
    try { ok(res, await svc.listReportCards(sid(req), q(req, 'sectionId'), q(req, 'academicYearId') || null, q(req, 'term'))); } catch (e) { fail(res, e); }
  }
  async publishReportCards(req: Request, res: Response) {
    try { ok(res, await svc.publishReportCards(sid(req), req.body)); } catch (e) { fail(res, e); }
  }
}

export default new ResultMgmtController();
