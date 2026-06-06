import { Request, Response } from 'express';
import adminService from './service';
import { successResponse, errorResponse, createdResponse, paginatedResponse, deletedResponse } from '@common/utils/response';

export class AdminController {
  /**
   * Create school
   */
  async createSchool(req: Request, res: Response): Promise<void> {
    try {
      const { name, email } = req.body;

      if (!name || !email) {
        return void errorResponse(res, 400, 'Name and email are required');
      }

      const school = await adminService.createSchool(req.body);
      createdResponse(res, school, 'School created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create school');
    }
  }

  /**
   * Update school
   */
  async updateSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID is required');
      }

      const school = await adminService.updateSchool(schoolId, req.body);
      successResponse(res, 200, school, 'School updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update school');
    }
  }

  /**
   * Get school by ID
   */
  async getSchoolById(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID is required');
      }

      const school = await adminService.getSchoolById(schoolId);
      successResponse(res, 200, school);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch school');
    }
  }

  /**
   * List schools
   */
  async listSchools(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const search = req.query.search as string | undefined;

      const result = await adminService.listSchools(page, limit, search);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list schools');
    }
  }

  /**
   * Deactivate school
   */
  async deactivateSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID is required');
      }

      const school = await adminService.deactivateSchool(schoolId);
      successResponse(res, 200, school, 'School deactivated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to deactivate school');
    }
  }

  /**
   * Activate school
   */
  async activateSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID is required');
      }

      const school = await adminService.activateSchool(schoolId);
      successResponse(res, 200, school, 'School activated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to activate school');
    }
  }

  /**
   * Delete school (soft delete)
   */
  async deleteSchool(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID is required');
      }

      await adminService.deleteSchool(schoolId);
      deletedResponse(res, 'School deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete school');
    }
  }

  /**
   * Create subscription plan
   */
  async createSubscriptionPlan(req: Request, res: Response): Promise<void> {
    try {
      const { name, price, maxUsers, maxStudents, storageLimit } = req.body;

      if (!name || !price || !maxUsers || !maxStudents || !storageLimit) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const plan = await adminService.createSubscriptionPlan(req.body);
      createdResponse(res, plan, 'Subscription plan created successfully');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to create subscription plan');
    }
  }

  /**
   * Update subscription plan
   */
  async updateSubscriptionPlan(req: Request, res: Response): Promise<void> {
    try {
      const { planId } = req.params;

      if (!planId) {
        return void errorResponse(res, 400, 'Plan ID is required');
      }

      const plan = await adminService.updateSubscriptionPlan(planId, req.body);
      successResponse(res, 200, plan, 'Subscription plan updated successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to update subscription plan');
    }
  }

  /**
   * Get subscription plan by ID
   */
  async getSubscriptionPlanById(req: Request, res: Response): Promise<void> {
    try {
      const { planId } = req.params;

      if (!planId) {
        return void errorResponse(res, 400, 'Plan ID is required');
      }

      const plan = await adminService.getSubscriptionPlanById(planId);
      successResponse(res, 200, plan);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch subscription plan');
    }
  }

  /**
   * List subscription plans
   */
  async listSubscriptionPlans(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const result = await adminService.listSubscriptionPlans(page, limit);
      paginatedResponse(res, result.data, page, limit, result.pagination.total);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list subscription plans');
    }
  }

  /**
   * Assign subscription to school
   */
  async assignSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId, planId, endDate } = req.body;

      if (!schoolId || !planId || !endDate) {
        return void errorResponse(res, 400, 'Required fields missing');
      }

      const subscription = await adminService.assignSubscription(req.body);
      createdResponse(res, subscription, 'Subscription assigned successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to assign subscription');
    }
  }

  /**
   * Get school subscription
   */
  async getSchoolSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID is required');
      }

      const subscription = await adminService.getSchoolSubscription(schoolId);
      successResponse(res, 200, subscription);
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to fetch school subscription');
    }
  }

  /**
   * Create domain
   */
  async createDomain(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId, domain } = req.body;

      if (!schoolId || !domain) {
        return void errorResponse(res, 400, 'School ID and domain are required');
      }

      const newDomain = await adminService.createDomain(req.body);
      createdResponse(res, newDomain, 'Domain created successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('already exists') ? 409 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to create domain');
    }
  }

  /**
   * List school domains
   */
  async listSchoolDomains(req: Request, res: Response): Promise<void> {
    try {
      const { schoolId } = req.params;

      if (!schoolId) {
        return void errorResponse(res, 400, 'School ID is required');
      }

      const domains = await adminService.listSchoolDomains(schoolId);
      successResponse(res, 200, domains);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to list domains');
    }
  }

  /**
   * Delete domain
   */
  async deleteDomain(req: Request, res: Response): Promise<void> {
    try {
      const { domainId } = req.params;

      if (!domainId) {
        return void errorResponse(res, 400, 'Domain ID is required');
      }

      await adminService.deleteDomain(domainId);
      deletedResponse(res, 'Domain deleted successfully');
    } catch (error: any) {
      const statusCode = error.message.includes('not found') ? 404 : 400;
      errorResponse(res, statusCode, error.message || 'Failed to delete domain');
    }
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const analytics = await adminService.getDashboardAnalytics();
      successResponse(res, 200, analytics);
    } catch (error: any) {
      errorResponse(res, 500, error.message || 'Failed to fetch analytics');
    }
  }
}

export default new AdminController();
