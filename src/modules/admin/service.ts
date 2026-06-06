import { db } from '@common/database/client';
import {
  CreateSchoolRequest,
  UpdateSchoolRequest,
  CreateSubscriptionPlanRequest,
  UpdateSubscriptionPlanRequest,
  AssignSubscriptionRequest,
  CreateDomainRequest,
  DashboardAnalytics,
} from './types';

export class AdminService {
  /**
   * Create a new school
   */
  async createSchool(data: CreateSchoolRequest) {
    const { name, email, phone, address, city, state, pincode, country, ...rest } = data;

    // Generate slug from name
    const slug = name
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]/g, '');

    // Check if school already exists
    const existingSchool = await db.school.findFirst({
      where: {
        OR: [{ email }, { name }, { slug }],
      },
    });

    if (existingSchool) {
      throw new Error('School with this email, name, or slug already exists');
    }

    const school = await db.school.create({
      data: {
        name,
        slug,
        email,
        phone,
        address,
        city,
        state,
        pincode,
        country,
        ...rest,
      },
    });

    return school;
  }

  /**
   * Update school details
   */
  async updateSchool(schoolId: string, data: UpdateSchoolRequest) {
    const school = await db.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new Error('School not found');
    }

    const updated = await db.school.update({
      where: { id: schoolId },
      data,
    });

    return updated;
  }

  /**
   * Get school by ID
   */
  async getSchoolById(schoolId: string) {
    const school = await db.school.findUnique({
      where: { id: schoolId },
      include: {
        subscriptions: {
          include: {
            plan: true,
          },
          take: 1,
          orderBy: {
            createdAt: 'desc',
          },
        },
        domains: true,
        _count: {
          select: {
            users: true,
            students: true,
            employees: true,
          },
        },
      },
    });

    if (!school) {
      throw new Error('School not found');
    }

    return school;
  }

  /**
   * List all schools with pagination
   */
  async listSchools(page: number = 1, limit: number = 10, search?: string) {
    const skip = (page - 1) * limit;

    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [schools, total] = await Promise.all([
      db.school.findMany({
        where,
        skip,
        take: limit,
        include: {
          subscriptions: {
            include: {
              plan: true,
            },
            take: 1,
            orderBy: {
              createdAt: 'desc',
            },
          },
          _count: {
            select: {
              users: true,
              students: true,
              employees: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.school.count({ where }),
    ]);

    return {
      data: schools,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Deactivate school
   */
  async deactivateSchool(schoolId: string) {
    const school = await db.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new Error('School not found');
    }

    const updated = await db.school.update({
      where: { id: schoolId },
      data: { isActive: false },
    });

    return updated;
  }

  /**
   * Activate school
   */
  async activateSchool(schoolId: string) {
    const school = await db.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new Error('School not found');
    }

    const updated = await db.school.update({
      where: { id: schoolId },
      data: { isActive: true },
    });

    return updated;
  }

  /**
   * Delete school (soft delete)
   */
  async deleteSchool(schoolId: string) {
    const school = await db.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new Error('School not found');
    }

    if (school.deletedAt) {
      throw new Error('School is already deleted');
    }

    const updated = await db.school.update({
      where: { id: schoolId },
      data: { deletedAt: new Date() },
    });

    return updated;
  }

  /**
   * Create subscription plan
   */
  async createSubscriptionPlan(data: CreateSubscriptionPlanRequest) {
    const { name } = data;

    const existing = await db.subscriptionPlan.findUnique({
      where: { name },
    });

    if (existing) {
      throw new Error('Subscription plan with this name already exists');
    }

    const plan = await db.subscriptionPlan.create({
      data: {
        name,
        description: data.description,
        price: data.price,
        currency: data.currency || 'INR',
        billingCycle: data.billingCycle || 'monthly',
        maxUsers: data.maxUsers,
        maxStudents: data.maxStudents,
        storageLimit: BigInt(data.storageLimit),
        featureFlags: data.featureFlags || [],
      },
    });

    return plan;
  }

  /**
   * Update subscription plan
   */
  async updateSubscriptionPlan(planId: string, data: UpdateSubscriptionPlanRequest) {
    const plan = await db.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    const updateData: any = { ...data };
    if (data.storageLimit) {
      updateData.storageLimit = BigInt(data.storageLimit);
    }

    const updated = await db.subscriptionPlan.update({
      where: { id: planId },
      data: updateData,
    });

    return updated;
  }

  /**
   * Get subscription plan by ID
   */
  async getSubscriptionPlanById(planId: string) {
    const plan = await db.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        subscriptions: {
          select: {
            id: true,
            schoolId: true,
            school: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    return plan;
  }

  /**
   * List subscription plans
   */
  async listSubscriptionPlans(page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [plans, total] = await Promise.all([
      db.subscriptionPlan.findMany({
        skip,
        take: limit,
        include: {
          subscriptions: {
            select: {
              id: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      }),
      db.subscriptionPlan.count(),
    ]);

    return {
      data: plans,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Assign subscription to school
   */
  async assignSubscription(data: AssignSubscriptionRequest) {
    const { schoolId, planId, endDate } = data;

    const school = await db.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new Error('School not found');
    }

    const plan = await db.subscriptionPlan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    // Remove existing subscription
    await db.subscription.updateMany({
      where: { schoolId },
      data: { deletedAt: new Date() },
    });

    // Create new subscription
    const subscription = await db.subscription.create({
      data: {
        schoolId,
        planId,
        endDate,
        autoRenew: data.autoRenew !== false,
        startDate: new Date(),
      },
      include: {
        plan: true,
        school: true,
      },
    });

    return subscription;
  }

  /**
   * Get school subscription
   */
  async getSchoolSubscription(schoolId: string) {
    const subscription = await db.subscription.findUnique({
      where: { schoolId },
      include: {
        plan: true,
        school: true,
      },
    });

    if (!subscription) {
      throw new Error('No active subscription found for this school');
    }

    return subscription;
  }

  /**
   * Create domain
   */
  async createDomain(data: CreateDomainRequest) {
    const { schoolId, domain, isPrimary } = data;

    const school = await db.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new Error('School not found');
    }

    const existing = await db.schoolDomain.findUnique({
      where: { domain },
    });

    if (existing) {
      throw new Error('Domain already exists');
    }

    if (isPrimary) {
      await db.schoolDomain.updateMany({
        where: { schoolId },
        data: { isPrimary: false },
      });
    }

    const newDomain = await db.schoolDomain.create({
      data: {
        schoolId,
        domain,
        isPrimary: isPrimary || false,
      },
    });

    return newDomain;
  }

  /**
   * List school domains
   */
  async listSchoolDomains(schoolId: string) {
    const domains = await db.schoolDomain.findMany({
      where: { schoolId },
      orderBy: {
        isPrimary: 'desc',
      },
    });

    return domains;
  }

  /**
   * Delete domain
   */
  async deleteDomain(domainId: string) {
    const domain = await db.schoolDomain.findUnique({
      where: { id: domainId },
    });

    if (!domain) {
      throw new Error('Domain not found');
    }

    await db.schoolDomain.delete({
      where: { id: domainId },
    });

    return { message: 'Domain deleted successfully' };
  }

  /**
   * Get dashboard analytics
   */
  async getDashboardAnalytics(): Promise<DashboardAnalytics> {
    const [totalSchools, activeSchools, inactiveSchools, totalSubscriptions, activeSubscriptions, totalUsers, recentSchools] = await Promise.all([
      db.school.count(),
      db.school.count({ where: { isActive: true, deletedAt: null } }),
      db.school.count({ where: { isActive: false, deletedAt: null } }),
      db.subscription.count(),
      db.subscription.count({ where: { status: 'ACTIVE' } }),
      db.user.count(),
      db.school.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          isActive: true,
          createdAt: true,
        },
      }),
    ]);

    const totalRevenue = 0; // TODO: Calculate from subscriptions
    const storageUsed = 0; // TODO: Calculate from files

    return {
      totalSchools,
      activeSchools,
      inactiveSchools,
      totalSubscriptions,
      activeSubscriptions,
      totalUsers,
      totalRevenue,
      storageUsed,
      recentSchools,
    };
  }
}

export default new AdminService();
