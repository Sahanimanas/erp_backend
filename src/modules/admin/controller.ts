import { Request, Response } from 'express';
import adminService from './service';
import {
  successResponse,
  errorResponse,
  createdResponse,
  paginatedResponse,
  deletedResponse,
} from '@common/utils/response';
import { auditFromRequest, AuditActions } from '@common/utils/audit';
import { PRODUCT_MODULES } from '@common/constants/modules';

const statusFor = (error: any): number => {
  const msg = String(error?.message || '');
  if (msg.includes('not found')) return 404;
  if (msg.includes('already') || msg.includes('taken')) return 409;
  return 400;
};

export class AdminController {
  // ── SUBDOMAIN ──────────────────────────────────────────────────────────
  async checkSubdomain(req: Request, res: Response): Promise<void> {
    try {
      const value = (req.body?.subdomain ?? req.query?.subdomain) as string;
      const result = await adminService.checkSubdomain(value || '');
      successResponse(res, 200, result);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to check subdomain');
    }
  }

  // ── SCHOOLS ────────────────────────────────────────────────────────────
  async createSchool(req: Request, res: Response): Promise<void> {
    try {
      const { name, email } = req.body;
      if (!name || !email) {
        return void errorResponse(res, 400, 'Name and email are required');
      }
      const school = await adminService.createSchool(req.body);
      await auditFromRequest(req, {
        schoolId: school.id,
        action: AuditActions.SCHOOL_CREATED,
        entity: 'School',
        entityId: school.id,
        newValues: { name: school.name, slug: school.slug, email: school.email },
      });
      createdResponse(res, school, 'School created successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to create school');
    }
  }

  async updateSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;
      const school = await adminService.updateSchool(schoolId, req.body);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.SCHOOL_UPDATED,
        entity: 'School',
        entityId: schoolId,
        newValues: req.body,
      });
      successResponse(res, 200, school, 'School updated successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to update school');
    }
  }

  async updateSchoolModules(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;
      const { modules } = req.body;
      if (!Array.isArray(modules)) {
        return void errorResponse(res, 400, 'modules must be an array');
      }
      const school = await adminService.updateSchoolModules(schoolId, modules);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.MODULES_UPDATED,
        entity: 'School',
        entityId: schoolId,
        newValues: { enabledModules: modules },
      });
      successResponse(res, 200, school, 'Modules updated successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to update modules');
    }
  }

  async getSchoolById(req: Request, res: Response): Promise<void> {
    try {
      const school = await adminService.getSchoolById(req.params.schoolId);
      successResponse(res, 200, school);
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to fetch school');
    }
  }

  async getSchoolUsers(req: Request, res: Response): Promise<void> {
    try {
      const users = await adminService.getSchoolUsers(
        req.params.schoolId,
        req.query.role as string | undefined
      );
      successResponse(res, 200, users);
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to fetch users');
    }
  }

  async listSchools(req: Request, res: Response): Promise<void> {
    try {
      const result = await adminService.listSchools({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 10,
        search: req.query.search as string | undefined,
        status: req.query.status as any,
        planId: req.query.planId as string | undefined,
      });
      paginatedResponse(
        res,
        result.data,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      );
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list schools');
    }
  }

  async deactivateSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;
      const school = await adminService.deactivateSchool(schoolId);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.SCHOOL_SUSPENDED,
        entity: 'School',
        entityId: schoolId,
      });
      successResponse(res, 200, school, 'School suspended successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to suspend school');
    }
  }

  async activateSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;
      const school = await adminService.activateSchool(schoolId);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.SCHOOL_ACTIVATED,
        entity: 'School',
        entityId: schoolId,
      });
      successResponse(res, 200, school, 'School activated successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to activate school');
    }
  }

  async deleteSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;
      await adminService.deleteSchool(schoolId);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.SCHOOL_DELETED,
        entity: 'School',
        entityId: schoolId,
      });
      deletedResponse(res, 'School deleted successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to delete school');
    }
  }

  async loginAsSchoolAdmin(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;
      const result = await adminService.loginAsSchoolAdmin(schoolId);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.IMPERSONATE_SCHOOL_ADMIN,
        entity: 'User',
        entityId: result.user.id,
        newValues: { impersonatedEmail: result.user.email },
      });
      successResponse(res, 200, result, 'Impersonation token issued');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to impersonate school admin');
    }
  }

  async resetSchoolAdminPassword(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;
      const { password } = req.body ?? {};
      const result = await adminService.resetSchoolAdminPassword(schoolId, password);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.RESET_SCHOOL_ADMIN_PASSWORD,
        entity: 'User',
        entityId: result.user.id,
        // Never log the password — record only who was reset and how.
        newValues: { email: result.user.email, generated: result.generated },
      });
      successResponse(res, 200, result, 'School admin password reset');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to reset school admin password');
    }
  }

  // ── SUBSCRIPTION PLANS ───────────────────────────────────────────────────
  async createSubscriptionPlan(req: Request, res: Response): Promise<void> {
    try {
      const { name, price, maxUsers, maxStudents, storageLimit } = req.body;
      if (!name || price === undefined || !maxUsers || !maxStudents || !storageLimit) {
        return void errorResponse(res, 400, 'Required fields missing');
      }
      const plan = await adminService.createSubscriptionPlan(req.body);
      successResponse(res, 201, plan, 'Subscription plan created successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to create subscription plan');
    }
  }

  async updateSubscriptionPlan(req: Request, res: Response): Promise<void> {
    try {
      const plan = await adminService.updateSubscriptionPlan(req.params.planId, req.body);
      successResponse(res, 200, plan, 'Subscription plan updated successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to update subscription plan');
    }
  }

  async getSubscriptionPlanById(req: Request, res: Response): Promise<void> {
    try {
      const plan = await adminService.getSubscriptionPlanById(req.params.planId);
      successResponse(res, 200, plan);
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to fetch subscription plan');
    }
  }

  async listSubscriptionPlans(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const result = await adminService.listSubscriptionPlans(page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list subscription plans');
    }
  }

  // ── SUBSCRIPTIONS ────────────────────────────────────────────────────────
  async assignSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId, planId, endDate } = req.body;
      if (!schoolId || !planId || !endDate) {
        return void errorResponse(res, 400, 'schoolId, planId and endDate are required');
      }
      const subscription = await adminService.assignSubscription(req.body);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.SUBSCRIPTION_ASSIGNED,
        entity: 'Subscription',
        entityId: subscription.id,
        newValues: { planId, endDate, status: subscription.status },
      });
      createdResponse(res, subscription, 'Subscription assigned successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to assign subscription');
    }
  }

  async getSchoolSubscription(req: Request, res: Response): Promise<void> {
    try {
      const subscription = await adminService.getSchoolSubscription(req.params.schoolId);
      successResponse(res, 200, subscription);
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to fetch school subscription');
    }
  }

  // ── DOMAINS ──────────────────────────────────────────────────────────────
  async createDomain(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId, domain } = req.body;
      if (!schoolId || !domain) {
        return void errorResponse(res, 400, 'School ID and domain are required');
      }
      const newDomain = await adminService.createDomain(req.body);
      await auditFromRequest(req, {
        schoolId,
        action: AuditActions.DOMAIN_ADDED,
        entity: 'SchoolDomain',
        entityId: newDomain.id,
        newValues: { domain: newDomain.domain, type: newDomain.type },
      });
      createdResponse(res, newDomain, 'Domain added successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to add domain');
    }
  }

  async listSchoolDomains(req: Request, res: Response): Promise<void> {
    try {
      const domains = await adminService.listSchoolDomains(req.params.schoolId);
      successResponse(res, 200, domains);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list domains');
    }
  }

  async listAllDomains(_req: Request, res: Response): Promise<void> {
    try {
      const domains = await adminService.listAllDomains();
      successResponse(res, 200, domains);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list domains');
    }
  }

  async verifyDomain(req: Request, res: Response): Promise<void> {
    try {
      const domain = await adminService.verifyDomain(req.params.domainId);
      await auditFromRequest(req, {
        schoolId: domain.schoolId,
        action: AuditActions.DOMAIN_VERIFIED,
        entity: 'SchoolDomain',
        entityId: domain.id,
        newValues: { domain: domain.domain },
      });
      successResponse(res, 200, domain, 'Domain verified successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to verify domain');
    }
  }

  async deleteDomain(req: Request, res: Response): Promise<void> {
    try {
      await adminService.deleteDomain(req.params.domainId);
      await auditFromRequest(req, {
        schoolId: req.body?.schoolId || 'platform',
        action: AuditActions.DOMAIN_REMOVED,
        entity: 'SchoolDomain',
        entityId: req.params.domainId,
      });
      deletedResponse(res, 'Domain removed successfully');
    } catch (error: any) {
      errorResponse(res, statusFor(error), error.message || 'Failed to remove domain');
    }
  }

  // ── AUDIT LOGS ───────────────────────────────────────────────────────────
  async listAuditLogs(req: Request, res: Response): Promise<void> {
    try {
      const result = await adminService.listAuditLogs({
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 20,
        schoolId: req.query.schoolId as string | undefined,
        action: req.query.action as string | undefined,
      });
      paginatedResponse(
        res,
        result.data,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      );
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list audit logs');
    }
  }

  // ── METADATA ───────────────────────────────────────────────────────────────
  async listModules(_req: Request, res: Response): Promise<void> {
    successResponse(res, 200, PRODUCT_MODULES);
  }

  // ── ANALYTICS ────────────────────────────────────────────────────────────
  async getDashboardAnalytics(_req: Request, res: Response): Promise<void> {
    try {
      const analytics = await adminService.getDashboardAnalytics();
      successResponse(res, 200, analytics);
    } catch (error: any) {
      errorResponse(res, 500, error.message || 'Failed to fetch analytics');
    }
  }
}

export default new AdminController();
