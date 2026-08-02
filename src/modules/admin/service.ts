import { db } from '@common/database/client';
import { config } from '@config/environment';
import {
  hashPassword,
  generateAccessToken,
  generateRandomPassword,
  generateSchoolSlug,
  validatePasswordStrength,
} from '@common/utils/crypto';
import {
  validateSubdomain,
  RESERVED_SUBDOMAINS,
} from '@common/constants/reservedSubdomains';
import { MODULE_KEYS } from '@common/constants/modules';
import { sendMail, schoolWelcomeEmail } from '@common/utils/mailer';
import {
  CreateSchoolRequest,
  UpdateSchoolRequest,
  CreateSubscriptionPlanRequest,
  UpdateSubscriptionPlanRequest,
  AssignSubscriptionRequest,
  CreateDomainRequest,
  ListSchoolsQuery,
  DashboardAnalytics,
} from './types';

// Months covered by the analytics time-series charts.
const CHART_MONTHS = 6;

export class AdminService {
  // ───────────────────────────────────────────────────────────────────────
  // SUBDOMAIN
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Check whether a subdomain is syntactically valid, not reserved, and free.
   * Returns a structured result instead of throwing so the UI can show inline
   * validation while the user types.
   */
  async checkSubdomain(raw: string) {
    const subdomain = (raw || '').trim().toLowerCase();
    const syntax = validateSubdomain(subdomain);
    if (!syntax.valid) {
      return { available: false, subdomain, reason: syntax.error };
    }

    const [existingSchool, existingDomain] = await Promise.all([
      // Ignore soft-deleted schools — their slug is released on delete/re-create.
      db.school.findFirst({ where: { slug: subdomain, deletedAt: null } }),
      db.schoolDomain.findUnique({
        where: { domain: `${subdomain}.${config.domain.platform}` },
      }),
    ]);

    // A domain row only blocks if its owning school is still active.
    const domainBlocks = existingDomain
      ? !!(await db.school.findFirst({ where: { id: existingDomain.schoolId, deletedAt: null } }))
      : false;

    if (existingSchool || domainBlocks) {
      return { available: false, subdomain, reason: 'Subdomain is already taken' };
    }

    return {
      available: true,
      subdomain,
      fqdn: `${subdomain}.${config.domain.platform}`,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // SCHOOLS
  // ───────────────────────────────────────────────────────────────────────

  /**
   * Create a new school (tenant) with its subdomain, an initial School Admin
   * user, a subscription, and a subdomain SchoolDomain record — all in one
   * transaction so a partial failure never leaves an orphaned tenant.
   */
  async createSchool(data: CreateSchoolRequest) {
    const { name, email } = data;

    // Resolve and validate the subdomain (slug).
    const subdomain = (data.subdomain?.trim().toLowerCase()) || generateSchoolSlug(name);
    const syntax = validateSubdomain(subdomain);
    if (!syntax.valid) {
      throw new Error(syntax.error || 'Invalid subdomain');
    }

    // Uniqueness checks (school name, email, slug, subdomain FQDN). Only ACTIVE
    // schools block creation — a soft-deleted school that still holds these
    // values is released below so the same name/subdomain/email can be reused.
    const fqdn = `${subdomain}.${config.domain.platform}`;
    const [dupSchool, dupDomain] = await Promise.all([
      db.school.findFirst({ where: { deletedAt: null, OR: [{ email }, { name }, { slug: subdomain }] } }),
      db.schoolDomain.findUnique({ where: { domain: fqdn } }),
    ]);
    if (dupSchool) {
      if (dupSchool.slug === subdomain) throw new Error('Subdomain is already taken');
      if (dupSchool.email === email) throw new Error('A school with this email already exists');
      throw new Error('A school with this name already exists');
    }
    if (dupDomain) {
      const domainOwner = await db.school.findUnique({ where: { id: dupDomain.schoolId } });
      if (domainOwner && !domainOwner.deletedAt) throw new Error('Subdomain is already taken');
    }

    // Free up identifiers still held by any previously-deleted school/domain so
    // the create transaction below won't hit a unique-constraint violation.
    await this.releaseDeletedConflicts(email, name, subdomain, fqdn);

    // Resolve the plan (explicit id, by name, or fall back to any active plan).
    const plan = await this.resolvePlan(data.planId, data.planName);

    // Validate enabled modules.
    const enabledModules = (data.enabledModules || []).filter((m) => MODULE_KEYS.includes(m));

    // Admin credentials.
    const adminEmail = (data.adminEmail || email).trim().toLowerCase();
    const generatedPassword = data.adminPassword || generateRandomPassword(12);
    const hashedPassword = await hashPassword(generatedPassword);

    // Subscription window.
    const isTrial = data.isTrial ?? !plan; // no plan → trial by default
    const endDate = data.expiryDate
      ? new Date(data.expiryDate)
      : new Date(Date.now() + (isTrial ? 14 : 365) * 24 * 60 * 60 * 1000);

    const result = await db.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name,
          slug: subdomain,
          email,
          phone: data.phone,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
          country: data.country,
          logo: data.logo,
          website: data.website,
          foundedYear: data.foundedYear,
          principalName: data.principalName,
          principalEmail: data.principalEmail,
          schoolCode: data.schoolCode || undefined,
          registrationNumber: data.registrationNumber || undefined,
          enabledModules,
          isActive: true,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          schoolId: school.id,
          firstName: data.adminFirstName || 'School',
          lastName: data.adminLastName || 'Admin',
          email: adminEmail,
          phone: data.phone,
          password: hashedPassword,
          role: 'SCHOOL_ADMIN',
          isActive: true,
          emailVerified: true,
        },
      });

      const domain = await tx.schoolDomain.create({
        data: {
          schoolId: school.id,
          domain: fqdn,
          type: 'subdomain',
          isPrimary: true,
          isActive: true,
          dnsStatus: 'ACTIVE', // wildcard *.platform already resolves
          sslStatus: 'ACTIVE',
          verifiedAt: new Date(),
        },
      });

      let subscription = null;
      if (plan) {
        subscription = await tx.subscription.create({
          data: {
            schoolId: school.id,
            planId: plan.id,
            status: isTrial ? 'TRIAL' : 'ACTIVE',
            startDate: new Date(),
            endDate,
            autoRenew: !isTrial,
          },
          include: { plan: true },
        });
      }

      return { school, adminUser, domain, subscription };
    });

    // Email the new school its login details. Sent AFTER the transaction has
    // committed (never mail credentials for a school that might roll back) and
    // awaited only so the operator learns whether it actually went out —
    // sendMail never throws, so a mail outage can't undo a created school.
    const loginUrl = `https://${result.domain.domain}`;
    const welcome = schoolWelcomeEmail({
      schoolName: result.school.name,
      loginUrl,
      // `adminEmail` (not the nullable column) — it IS the login username.
      username: adminEmail,
      password: generatedPassword,
      adminName: [result.adminUser.firstName, result.adminUser.lastName].filter(Boolean).join(' ').trim(),
    });
    const mail = await sendMail({
      to: adminEmail,
      subject: welcome.subject,
      html: welcome.html,
    });

    return {
      ...result.school,
      domain: result.domain,
      subscription: result.subscription,
      adminUser: {
        id: result.adminUser.id,
        email: result.adminUser.email,
        // Surface the generated password ONCE so the operator can hand it over.
        temporaryPassword: data.adminPassword ? undefined : generatedPassword,
      },
      // So the superadmin UI can say "credentials emailed" — or show why not,
      // rather than leaving the operator to assume the school was notified.
      credentialsEmail: {
        sent: mail.sent,
        to: adminEmail,
        error: mail.error,
      },
    };
  }

  /** Resolve a plan from id, name, or the cheapest active plan. */
  private async resolvePlan(planId?: string, planName?: string) {
    if (planId) {
      const p = await db.subscriptionPlan.findUnique({ where: { id: planId } });
      if (!p) throw new Error('Subscription plan not found');
      return p;
    }
    if (planName) {
      const p = await db.subscriptionPlan.findFirst({
        where: { name: { equals: planName, mode: 'insensitive' } },
      });
      if (p) return p;
    }
    return db.subscriptionPlan.findFirst({
      where: { isActive: true },
      orderBy: { price: 'asc' },
    });
  }

  async updateSchool(schoolId: string, data: UpdateSchoolRequest) {
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error('School not found');

    const updateData: any = { ...data };
    if (data.enabledModules) {
      updateData.enabledModules = data.enabledModules.filter((m) => MODULE_KEYS.includes(m));
    }

    return db.school.update({ where: { id: schoolId }, data: updateData });
  }

  /** Toggle the set of modules enabled for a tenant. */
  async updateSchoolModules(schoolId: string, modules: string[]) {
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error('School not found');

    const enabledModules = (modules || []).filter((m) => MODULE_KEYS.includes(m));
    return db.school.update({
      where: { id: schoolId },
      data: { enabledModules },
    });
  }

  async getSchoolById(schoolId: string) {
    const school = await db.school.findUnique({
      where: { id: schoolId },
      include: {
        subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: 'desc' } },
        domains: { orderBy: { isPrimary: 'desc' } },
        _count: { select: { users: true, students: true, employees: true } },
      },
    });
    if (!school) throw new Error('School not found');

    // Storage actually consumed by this tenant's uploaded files.
    const storageAgg = await db.file.aggregate({
      where: { schoolId, deletedAt: null },
      _sum: { fileSize: true },
    });

    const teacherCount = await db.user.count({
      where: { schoolId, role: 'TEACHER', deletedAt: null },
    });

    return {
      ...school,
      teacherCount,
      storageUsed: Number(storageAgg._sum.fileSize ?? 0),
      derivedStatus: this.deriveStatus(school, school.subscriptions[0]),
    };
  }

  /** Users belonging to a tenant, grouped/filterable by role. */
  async getSchoolUsers(schoolId: string, role?: string) {
    const where: any = { schoolId, deletedAt: null };
    if (role) where.role = role;

    const users = await db.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return users;
  }

  /**
   * Derive a presentation status for a school from its active flag + latest
   * subscription. One of: inactive | trial | expired | active | pending.
   */
  private deriveStatus(school: { isActive: boolean }, sub?: any): string {
    if (!school.isActive) return 'inactive';
    if (!sub) return 'pending';
    const now = new Date();
    if (sub.status === 'TRIAL') return new Date(sub.endDate) < now ? 'expired' : 'trial';
    if (sub.status === 'EXPIRED' || new Date(sub.endDate) < now) return 'expired';
    if (sub.status === 'ACTIVE') return 'active';
    return String(sub.status).toLowerCase();
  }

  async listSchools(query: ListSchoolsQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: any = { deletedAt: null };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { slug: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    // Status filter is expressed through the school flag + subscription relation.
    switch (query.status) {
      case 'active':
        where.isActive = true;
        where.subscriptions = { some: { status: 'ACTIVE', endDate: { gte: now } } };
        break;
      case 'inactive':
        where.isActive = false;
        break;
      case 'trial':
        where.subscriptions = { some: { status: 'TRIAL' } };
        break;
      case 'expired':
        where.subscriptions = {
          some: { OR: [{ status: 'EXPIRED' }, { endDate: { lt: now } }] },
        };
        break;
    }

    if (query.planId) {
      where.subscriptions = { ...(where.subscriptions || {}), some: { ...(where.subscriptions?.some || {}), planId: query.planId } };
    }

    const [schools, total] = await Promise.all([
      db.school.findMany({
        where,
        skip,
        take: limit,
        include: {
          subscriptions: { include: { plan: true }, take: 1, orderBy: { createdAt: 'desc' } },
          domains: { where: { isPrimary: true }, take: 1 },
          _count: { select: { users: true, students: true, employees: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.school.count({ where }),
    ]);

    const data = await Promise.all(
      schools.map(async (s) => {
        const teacherCount = await db.user.count({
          where: { schoolId: s.id, role: 'TEACHER', deletedAt: null },
        });
        return {
          ...s,
          teacherCount,
          studentCount: s._count.students,
          derivedStatus: this.deriveStatus(s, s.subscriptions[0]),
          primaryDomain: s.domains[0]?.domain ?? `${s.slug}.${config.domain.platform}`,
        };
      })
    );

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async deactivateSchool(schoolId: string) {
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error('School not found');
    return db.school.update({ where: { id: schoolId }, data: { isActive: false } });
  }

  async activateSchool(schoolId: string) {
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error('School not found');
    return db.school.update({ where: { id: schoolId }, data: { isActive: true } });
  }

  // Marker appended to a deleted school's globally-unique fields so the same
  // name / subdomain / email can be reused by a new school. Keyed by the row id
  // so the tombstoned value is itself unique and stable (no clashes on repeat).
  private static DELETED_MARK = '__deleted__';
  private tombstone(value: string, id: string): string {
    return value.includes(AdminService.DELETED_MARK) ? value : `${value}${AdminService.DELETED_MARK}${id}`;
  }

  /**
   * Soft-delete a school AND release its globally-unique identifiers (name, slug,
   * email, schoolCode, registrationNumber + its domain rows) so a new school can
   * be created with the same values. The record itself is retained (deletedAt
   * set) for audit — nothing is hard-deleted.
   */
  async deleteSchool(schoolId: string) {
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error('School not found');
    if (school.deletedAt) throw new Error('School is already deleted');

    return db.$transaction(async (tx) => {
      const updated = await tx.school.update({
        where: { id: schoolId },
        data: {
          deletedAt: new Date(),
          isActive: false,
          name: this.tombstone(school.name, school.id),
          slug: this.tombstone(school.slug, school.id),
          email: this.tombstone(school.email, school.id),
          ...(school.schoolCode ? { schoolCode: this.tombstone(school.schoolCode, school.id) } : {}),
          ...(school.registrationNumber ? { registrationNumber: this.tombstone(school.registrationNumber, school.id) } : {}),
        },
      });
      // Domain is globally unique too — release each so the FQDN can be reissued.
      const domains = await tx.schoolDomain.findMany({ where: { schoolId } });
      for (const d of domains) {
        await tx.schoolDomain.update({
          where: { id: d.id },
          data: { domain: this.tombstone(d.domain, d.id), isActive: false },
        });
      }
      return updated;
    });
  }

  /**
   * Release the unique identifiers held by any ALREADY soft-deleted school (or
   * its domain) that collides with the values a new school wants. Fixes schools
   * deleted before delete-time release existed, so their name/subdomain/email
   * become reusable. Active schools are left untouched (the caller rejects them).
   */
  private async releaseDeletedConflicts(email: string, name: string, subdomain: string, fqdn: string) {
    const conflicts = await db.school.findMany({
      where: { deletedAt: { not: null }, OR: [{ email }, { name }, { slug: subdomain }] },
    });
    for (const c of conflicts) {
      await db.school.update({
        where: { id: c.id },
        data: {
          name: this.tombstone(c.name, c.id),
          slug: this.tombstone(c.slug, c.id),
          email: this.tombstone(c.email, c.id),
        },
      });
    }
    const dom = await db.schoolDomain.findUnique({ where: { domain: fqdn } });
    if (dom) {
      const owner = await db.school.findUnique({ where: { id: dom.schoolId } });
      if (owner?.deletedAt) {
        await db.schoolDomain.update({ where: { id: dom.id }, data: { domain: this.tombstone(dom.domain, dom.id), isActive: false } });
      }
    }
  }

  /**
   * Issue a short-lived access token impersonating the school's primary admin.
   * Super-admin-only; the action itself is audited by the controller.
   */
  async loginAsSchoolAdmin(schoolId: string) {
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error('School not found');

    const admin = await db.user.findFirst({
      where: { schoolId, role: 'SCHOOL_ADMIN', isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) throw new Error('This school has no active admin to impersonate');

    const rolePermissions = await db.rolePermission.findMany({
      where: { role: { name: admin.role as any }, schoolId: admin.schoolId },
      include: { permission: true },
    });
    const permissions = Array.from(
      new Set(rolePermissions.map((rp) => rp.permission?.name).filter(Boolean) as string[])
    );

    const accessToken = generateAccessToken({
      userId: admin.id,
      schoolId: admin.schoolId,
      role: admin.role,
      permissions,
    });

    return {
      accessToken,
      school: { id: school.id, name: school.name, slug: school.slug, logo: school.logo },
      user: {
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
        role: admin.role,
        schoolId: admin.schoolId,
      },
    };
  }

  /**
   * Reset the password of a school's admin account.
   *
   * When `newPassword` is supplied it is used (after a strength check); otherwise
   * a strong random password is generated. The plaintext is returned exactly once
   * so the Super Admin can hand it to the school — it is never stored in clear.
   * All of that user's refresh tokens are revoked so existing sessions are forced
   * to re-authenticate.
   */
  async resetSchoolAdminPassword(schoolId: string, newPassword?: string) {
    const school = await db.school.findUnique({ where: { id: schoolId } });
    if (!school) throw new Error('School not found');

    const admin = await db.user.findFirst({
      where: { schoolId, role: 'SCHOOL_ADMIN', isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    if (!admin) throw new Error('This school has no active admin account');

    let password = newPassword?.trim();
    const generated = !password;
    if (password) {
      const validation = validatePasswordStrength(password);
      if (!validation.valid) throw new Error(validation.errors.join('. '));
    } else {
      password = generateRandomPassword(12);
    }

    const hashedPassword = await hashPassword(password);

    await db.$transaction([
      db.user.update({
        where: { id: admin.id },
        data: { password: hashedPassword, lastPasswordChange: new Date() },
      }),
      // Invalidate any active sessions for the impersonated admin.
      db.refreshToken.updateMany({
        where: { userId: admin.id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);

    return {
      school: { id: school.id, name: school.name, slug: school.slug },
      user: {
        id: admin.id,
        firstName: admin.firstName,
        lastName: admin.lastName,
        email: admin.email,
      },
      password,
      generated,
    };
  }

  // ───────────────────────────────────────────────────────────────────────
  // SUBSCRIPTION PLANS
  // ───────────────────────────────────────────────────────────────────────

  async createSubscriptionPlan(data: CreateSubscriptionPlanRequest) {
    const existing = await db.subscriptionPlan.findUnique({ where: { name: data.name } });
    if (existing) throw new Error('Subscription plan with this name already exists');

    return db.subscriptionPlan.create({
      data: {
        name: data.name,
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
  }

  async updateSubscriptionPlan(planId: string, data: UpdateSubscriptionPlanRequest) {
    const plan = await db.subscriptionPlan.findUnique({ where: { id: planId } });
    if (!plan) throw new Error('Subscription plan not found');

    const updateData: any = { ...data };
    if (data.storageLimit !== undefined) updateData.storageLimit = BigInt(data.storageLimit);

    return db.subscriptionPlan.update({ where: { id: planId }, data: updateData });
  }

  async getSubscriptionPlanById(planId: string) {
    const plan = await db.subscriptionPlan.findUnique({
      where: { id: planId },
      include: {
        subscriptions: {
          select: { id: true, schoolId: true, school: { select: { id: true, name: true } } },
        },
      },
    });
    if (!plan) throw new Error('Subscription plan not found');
    return plan;
  }

  async listSubscriptionPlans(page: number = 1, limit: number = 50) {
    const skip = (page - 1) * limit;
    const [plans, total] = await Promise.all([
      db.subscriptionPlan.findMany({
        skip,
        take: limit,
        include: { _count: { select: { subscriptions: true } } },
        orderBy: { price: 'asc' },
      }),
      db.subscriptionPlan.count(),
    ]);
    return { data: plans, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ───────────────────────────────────────────────────────────────────────
  // SUBSCRIPTIONS
  // ───────────────────────────────────────────────────────────────────────

  /** Assign / change a school's subscription (upgrade, downgrade, renew). */
  async assignSubscription(data: AssignSubscriptionRequest) {
    const [school, plan] = await Promise.all([
      db.school.findUnique({ where: { id: data.schoolId } }),
      db.subscriptionPlan.findUnique({ where: { id: data.planId } }),
    ]);
    if (!school) throw new Error('School not found');
    if (!plan) throw new Error('Subscription plan not found');

    const endDate = new Date(data.endDate);
    const status = data.status || 'ACTIVE';

    // Subscription has a unique [schoolId] constraint → upsert.
    return db.subscription.upsert({
      where: { schoolId: data.schoolId },
      update: {
        planId: data.planId,
        status,
        endDate,
        autoRenew: data.autoRenew !== false,
        deletedAt: null,
      },
      create: {
        schoolId: data.schoolId,
        planId: data.planId,
        status,
        startDate: new Date(),
        endDate,
        autoRenew: data.autoRenew !== false,
      },
      include: { plan: true, school: true },
    });
  }

  async getSchoolSubscription(schoolId: string) {
    const subscription = await db.subscription.findUnique({
      where: { schoolId },
      include: { plan: true, school: true },
    });
    if (!subscription) throw new Error('No active subscription found for this school');
    return subscription;
  }

  // ───────────────────────────────────────────────────────────────────────
  // DOMAINS
  // ───────────────────────────────────────────────────────────────────────

  async createDomain(data: CreateDomainRequest) {
    const school = await db.school.findUnique({ where: { id: data.schoolId } });
    if (!school) throw new Error('School not found');

    const domain = data.domain.trim().toLowerCase();
    const existing = await db.schoolDomain.findUnique({ where: { domain } });
    if (existing) throw new Error('Domain already exists');

    const type = data.type || (domain.endsWith(`.${config.domain.platform}`) ? 'subdomain' : 'custom');
    const isSubdomain = type === 'subdomain';

    if (data.isPrimary) {
      await db.schoolDomain.updateMany({
        where: { schoolId: data.schoolId },
        data: { isPrimary: false },
      });
    }

    return db.schoolDomain.create({
      data: {
        schoolId: data.schoolId,
        domain,
        type,
        isPrimary: data.isPrimary || false,
        // Subdomains under the wildcard are instantly live; custom domains must
        // be DNS-verified by the operator before they go active.
        dnsStatus: isSubdomain ? 'ACTIVE' : 'PENDING',
        sslStatus: isSubdomain ? 'ACTIVE' : 'PENDING',
        verifiedAt: isSubdomain ? new Date() : null,
      },
    });
  }

  async listSchoolDomains(schoolId: string) {
    return db.schoolDomain.findMany({
      where: { schoolId },
      orderBy: { isPrimary: 'desc' },
    });
  }

  /** List every domain across the platform (Domain Management page). */
  async listAllDomains() {
    return db.schoolDomain.findMany({
      include: { school: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Verify a custom domain. Real DNS/SSL provisioning would call out to the
   * platform provider (Vercel / Cloudflare); here we mark it verified. The
   * integration point is intentionally isolated so a provider can be plugged in.
   */
  async verifyDomain(domainId: string) {
    const domain = await db.schoolDomain.findUnique({ where: { id: domainId } });
    if (!domain) throw new Error('Domain not found');

    // TODO(provider): replace with Vercel/Cloudflare DNS + SSL check.
    return db.schoolDomain.update({
      where: { id: domainId },
      data: {
        dnsStatus: 'ACTIVE',
        sslStatus: 'ACTIVE',
        isActive: true,
        verifiedAt: new Date(),
      },
    });
  }

  async deleteDomain(domainId: string) {
    const domain = await db.schoolDomain.findUnique({ where: { id: domainId } });
    if (!domain) throw new Error('Domain not found');
    if (domain.isPrimary) throw new Error('Cannot remove the primary domain');
    await db.schoolDomain.delete({ where: { id: domainId } });
    return { message: 'Domain deleted successfully' };
  }

  // ───────────────────────────────────────────────────────────────────────
  // AUDIT LOGS
  // ───────────────────────────────────────────────────────────────────────

  async listAuditLogs(opts: { page?: number; limit?: number; schoolId?: string; action?: string }) {
    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(opts.limit) || 20));
    const skip = (page - 1) * limit;

    const where: any = {};
    if (opts.schoolId) where.schoolId = opts.schoolId;
    if (opts.action) where.action = opts.action;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
          school: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      db.auditLog.count({ where }),
    ]);

    return { data: logs, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  // ───────────────────────────────────────────────────────────────────────
  // ANALYTICS
  // ───────────────────────────────────────────────────────────────────────

  async getDashboardAnalytics(): Promise<DashboardAnalytics> {
    const now = new Date();

    const [
      totalSchools,
      activeSchools,
      inactiveSchools,
      trialSchools,
      expiredSubscriptions,
      totalSubscriptions,
      activeSubscriptions,
      totalUsers,
      totalStudents,
      totalTeachers,
      storageAgg,
      activeSubsWithPlan,
      recentSchools,
      subsByStatus,
      schoolsTS,
      subsTS,
      allPlans,
    ] = await Promise.all([
      db.school.count({ where: { deletedAt: null } }),
      db.school.count({ where: { isActive: true, deletedAt: null } }),
      db.school.count({ where: { isActive: false, deletedAt: null } }),
      db.subscription.count({ where: { status: 'TRIAL', deletedAt: null } }),
      db.subscription.count({
        where: { deletedAt: null, OR: [{ status: 'EXPIRED' }, { endDate: { lt: now } }] },
      }),
      db.subscription.count({ where: { deletedAt: null } }),
      db.subscription.count({ where: { status: 'ACTIVE', deletedAt: null, endDate: { gte: now } } }),
      db.user.count({ where: { deletedAt: null } }),
      db.student.count({ where: { deletedAt: null } }),
      db.user.count({ where: { role: 'TEACHER', deletedAt: null } }),
      db.file.aggregate({ where: { deletedAt: null }, _sum: { fileSize: true } }),
      db.subscription.findMany({
        where: { deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] }, endDate: { gte: now } },
        include: { plan: true },
      }),
      db.school.findMany({
        where: { deletedAt: null },
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: { id: true, name: true, slug: true, email: true, isActive: true, createdAt: true },
      }),
      db.subscription.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
      db.school.findMany({ where: { deletedAt: null }, select: { createdAt: true } }),
      db.subscription.findMany({ where: { deletedAt: null }, include: { plan: true } }),
      db.subscriptionPlan.findMany({ select: { id: true, name: true } }),
    ]);

    // Monthly recognized revenue from currently-billing (ACTIVE) subscriptions.
    const monthlyRevenue = activeSubsWithPlan.reduce((sum, s) => {
      if (s.status !== 'ACTIVE' || !s.plan) return sum;
      const price = s.plan.price || 0;
      return sum + (s.plan.billingCycle === 'yearly' ? price / 12 : price);
    }, 0);

    // Time-series for charts (data fetched in the batch above).
    const schools = schoolsTS;
    const subs = subsTS;

    const buckets = this.lastMonthBuckets(now, CHART_MONTHS);
    const schoolGrowth = buckets.map((b) => ({
      month: b.label,
      schools: schools.filter((s) => s.createdAt <= b.end).length, // cumulative
    }));
    const revenueGrowth = buckets.map((b) => {
      const revenue = subs
        .filter((s) => new Date(s.startDate) <= b.end && new Date(s.endDate) >= b.start && s.plan)
        .reduce((sum, s) => {
          const price = s.plan!.price || 0;
          return sum + (s.plan!.billingCycle === 'yearly' ? price / 12 : price);
        }, 0);
      return { month: b.label, revenue: Math.round(revenue) };
    });

    // Subscriptions-by-plan computed from the already-fetched subs + plans.
    const planNameById = new Map(allPlans.map((p) => [p.id, p.name]));
    const planCounts = new Map<string, number>();
    for (const s of subs) {
      const name = (s as any).plan?.name || planNameById.get(s.planId) || 'Unknown';
      planCounts.set(name, (planCounts.get(name) || 0) + 1);
    }
    const subscriptionsByPlan = [...planCounts.entries()].map(([plan, count]) => ({ plan, count }));
    const subscriptionsByStatus = subsByStatus.map((g: any) => ({
      status: g.status,
      count: typeof g._count === 'number' ? g._count : g._count?._all ?? 0,
    }));

    return {
      totalSchools,
      activeSchools,
      trialSchools,
      expiredSubscriptions,
      inactiveSchools,
      totalSubscriptions,
      activeSubscriptions,
      totalUsers,
      totalStudents,
      totalTeachers,
      monthlyRevenue: Math.round(monthlyRevenue),
      totalRevenue: Math.round(revenueGrowth.reduce((a, b) => a + b.revenue, 0)),
      storageUsed: Number(storageAgg._sum.fileSize ?? 0),
      serverStatus: 'operational',
      charts: { schoolGrowth, revenueGrowth, subscriptionsByPlan, subscriptionsByStatus },
      recentSchools,
    };
  }

  private async subscriptionsByPlan() {
    const grouped = await db.subscription.groupBy({
      by: ['planId'],
      where: { deletedAt: null },
      _count: true,
    });
    const plans = await db.subscriptionPlan.findMany({ select: { id: true, name: true } });
    const nameById = new Map(plans.map((p) => [p.id, p.name]));
    return grouped.map((g: any) => ({
      plan: nameById.get(g.planId) || 'Unknown',
      count: typeof g._count === 'number' ? g._count : g._count?._all ?? 0,
    }));
  }

  /** Build the last `count` month buckets [start,end] with short labels. */
  private lastMonthBuckets(now: Date, count: number) {
    const buckets: { label: string; start: Date; end: Date }[] = [];
    for (let i = count - 1; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      buckets.push({
        label: start.toLocaleString('en-US', { month: 'short' }),
        start,
        end,
      });
    }
    return buckets;
  }
}

export default new AdminService();
