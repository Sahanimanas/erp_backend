import { Request, Response } from 'express';
import svc from './service';
import { successResponse, errorResponse } from '@common/utils/response';

const sid = (req: Request) => req.user?.schoolId as string;
const ok = (res: Response, data: any, msg?: string) => successResponse(res, 200, data, msg);
const fail = (res: Response, e: any) => errorResponse(res, 400, e.message || 'Request failed');

export class ClassMgmtController {
  // Sessions
  async listSessions(req: Request, res: Response) { try { ok(res, await svc.listSessions(sid(req))); } catch (e) { fail(res, e); } }
  async saveSession(req: Request, res: Response) { try { ok(res, await svc.saveSession(sid(req), req.body), 'Session saved'); } catch (e) { fail(res, e); } }
  async setActiveSession(req: Request, res: Response) { try { ok(res, await svc.setActiveSession(sid(req), req.params.id)); } catch (e) { fail(res, e); } }
  async deleteSession(req: Request, res: Response) { try { ok(res, await svc.deleteSession(sid(req), req.params.id)); } catch (e) { fail(res, e); } }

  // Classes
  async listClasses(req: Request, res: Response) { try { ok(res, await svc.listClasses(sid(req), req.query.academicYearId as string)); } catch (e) { fail(res, e); } }
  async saveClass(req: Request, res: Response) { try { ok(res, await svc.saveClass(sid(req), req.body), 'Class saved'); } catch (e) { fail(res, e); } }
  async deleteClass(req: Request, res: Response) { try { ok(res, await svc.deleteClass(sid(req), req.params.id)); } catch (e) { fail(res, e); } }

  // Class details
  async getClassDetails(req: Request, res: Response) { try { ok(res, await svc.getClassDetails(sid(req), req.query.classId as string)); } catch (e) { fail(res, e); } }
  async saveClassDetails(req: Request, res: Response) { try { ok(res, await svc.saveClassDetails(sid(req), req.body.classId, req.body.details), 'Details saved'); } catch (e) { fail(res, e); } }

  // Subjects
  async listClassSubjects(req: Request, res: Response) { try { ok(res, await svc.listClassSubjects(sid(req), req.query.classId as string)); } catch (e) { fail(res, e); } }
  async saveClassSubject(req: Request, res: Response) { try { ok(res, await svc.saveClassSubject(sid(req), req.body), 'Subject saved'); } catch (e) { fail(res, e); } }

  // Non-subjects
  async listNonSubjects(req: Request, res: Response) { try { ok(res, await svc.listNonSubjects(sid(req), req.query.classId as string)); } catch (e) { fail(res, e); } }
  async saveNonSubject(req: Request, res: Response) { try { ok(res, await svc.saveNonSubject(sid(req), req.body), 'Non-subject saved'); } catch (e) { fail(res, e); } }

  // Syllabus
  async listSyllabus(req: Request, res: Response) { try { ok(res, await svc.listSyllabus(sid(req))); } catch (e) { fail(res, e); } }
  async getSyllabus(req: Request, res: Response) { try { ok(res, await svc.getSyllabus(sid(req), req.params.id)); } catch (e) { fail(res, e); } }
  async saveSyllabus(req: Request, res: Response) { try { ok(res, await svc.saveSyllabus(sid(req), req.body), 'Syllabus saved'); } catch (e) { fail(res, e); } }
  async deleteSyllabus(req: Request, res: Response) { try { ok(res, await svc.deleteSyllabus(sid(req), req.params.id)); } catch (e) { fail(res, e); } }

  // Employee ↔ subject mapping
  async getEmployeeMapping(req: Request, res: Response) { try { ok(res, await svc.getEmployeeMapping(sid(req), req.query.employeeId as string, req.query.classId as string)); } catch (e) { fail(res, e); } }
  async saveEmployeeMapping(req: Request, res: Response) { try { ok(res, await svc.saveEmployeeMapping(sid(req), req.body), 'Mapping saved'); } catch (e) { fail(res, e); } }
}

export default new ClassMgmtController();
