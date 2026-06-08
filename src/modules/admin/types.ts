// Admin/SuperAdmin types

export interface CreateSchoolRequest {
  // Basic details
  name: string;
  schoolCode?: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  logo?: string;
  website?: string;
  foundedYear?: number;
  principalName?: string;
  principalEmail?: string;
  registrationNumber?: string;

  // Domain — the tenant subdomain (becomes School.slug). If omitted it is
  // derived from the name.
  subdomain?: string;

  // Subscription
  planId?: string;          // explicit plan, OR
  planName?: string;        // match a plan by name ("Free Trial" | "Basic" | ...)
  isTrial?: boolean;
  expiryDate?: string | Date;
  enabledModules?: string[];

  // Initial School Admin user (optional — email/phone default to the school's)
  adminFirstName?: string;
  adminLastName?: string;
  adminEmail?: string;
  adminPassword?: string;   // if omitted, a strong password is generated & returned
}

export interface UpdateSchoolRequest {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  logo?: string;
  website?: string;
  foundedYear?: number;
  principalName?: string;
  principalEmail?: string;
  schoolCode?: string;
  registrationNumber?: string;
  enabledModules?: string[];
}

export interface CreateSubscriptionPlanRequest {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  billingCycle?: string;
  maxUsers: number;
  maxStudents: number;
  storageLimit: number;
  featureFlags?: string[];
}

export interface UpdateSubscriptionPlanRequest {
  name?: string;
  description?: string;
  price?: number;
  currency?: string;
  billingCycle?: string;
  maxUsers?: number;
  maxStudents?: number;
  storageLimit?: number;
  featureFlags?: string[];
  isActive?: boolean;
}

export interface AssignSubscriptionRequest {
  schoolId: string;
  planId: string;
  endDate: Date | string;
  status?: 'TRIAL' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED' | 'PENDING' | 'CANCELLED';
  autoRenew?: boolean;
}

export interface CreateDomainRequest {
  schoolId: string;
  domain: string;
  type?: 'subdomain' | 'custom';
  isPrimary?: boolean;
}

export interface ListSchoolsQuery {
  page?: number;
  limit?: number;
  search?: string;
  status?: 'active' | 'inactive' | 'trial' | 'expired' | 'all';
  planId?: string;
}

export interface DashboardAnalytics {
  totalSchools: number;
  activeSchools: number;
  trialSchools: number;
  expiredSubscriptions: number;
  inactiveSchools: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  totalUsers: number;
  totalStudents: number;
  totalTeachers: number;
  monthlyRevenue: number;
  totalRevenue: number;
  storageUsed: number;
  serverStatus: 'operational' | 'degraded' | 'down';
  charts: {
    schoolGrowth: { month: string; schools: number }[];
    revenueGrowth: { month: string; revenue: number }[];
    subscriptionsByPlan: { plan: string; count: number }[];
    subscriptionsByStatus: { status: string; count: number }[];
  };
  recentSchools: any[];
}
