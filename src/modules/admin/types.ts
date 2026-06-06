// Admin/SuperAdmin types

export interface CreateSchoolRequest {
  name: string;
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
  schoolCode?: string;
  registrationNumber?: string;
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
  endDate: Date;
  autoRenew?: boolean;
}

export interface CreateDomainRequest {
  schoolId: string;
  domain: string;
  isPrimary?: boolean;
}

export interface DashboardAnalytics {
  totalSchools: number;
  activeSchools: number;
  inactiveSchools: number;
  totalSubscriptions: number;
  activeSubscriptions: number;
  totalUsers: number;
  totalRevenue: number;
  storageUsed: number;
  recentSchools: any[];
}
