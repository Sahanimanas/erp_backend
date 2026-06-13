import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * PRODUCTION SEED — reference / bootstrap data only.
 * ─────────────────────────────────────────────────────────────────────────────
 * This seed creates ONLY the data a fresh production deployment needs to
 * function. It is fully idempotent (every write is an upsert), so it is safe to
 * re-run on an existing database.
 *
 * It creates:
 *   • Roles (RBAC role catalog)
 *   • Permissions (RBAC permission catalog)
 *   • Subscription plan catalog (the plans schools subscribe to)
 *   • The platform tenant + the SUPER_ADMIN account (credentials from env)
 *
 * It does NOT create any demo/sample data — real schools (with their academic
 * years, classes, A–Z sections, students, staff, fees, etc.) are onboarded from
 * the app: Super Admin → Create School, then Settings → Classes & Sections.
 *
 * Required environment variables:
 *   SUPER_ADMIN_EMAIL      e.g. superadmin@globalschoolmitra.com
 *   SUPER_ADMIN_PASSWORD   a strong password (hashed before storage)
 */
async function main() {
  console.log('🌱 Seeding production reference data...');

  // Super admin credentials come from the environment so real secrets never
  // live in source control. Fail loudly if they are not provided.
  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
  if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD) {
    throw new Error(
      'Refusing to seed: set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD environment variables first.'
    );
  }
  const hashedPassword = await bcrypt.hash(SUPER_ADMIN_PASSWORD, await bcrypt.genSalt(10));

  // Define all roles
  const roles = [
    { name: 'SUPER_ADMIN' as UserRole, description: 'Platform administrator with full access' },
    { name: 'SCHOOL_ADMIN' as UserRole, description: 'School administrator' },
    { name: 'PRINCIPAL' as UserRole, description: 'School principal' },
    { name: 'TEACHER' as UserRole, description: 'Teacher' },
    { name: 'ACCOUNTANT' as UserRole, description: 'Accountant' },
    { name: 'STUDENT' as UserRole, description: 'Student' },
    { name: 'PARENT' as UserRole, description: 'Parent/Guardian' },
  ];

  // Define all permissions
  const permissions = [
    // School Management
    { name: 'CREATE_SCHOOL', description: 'Create new school', category: 'school' },
    { name: 'READ_SCHOOL', description: 'View school details', category: 'school' },
    { name: 'UPDATE_SCHOOL', description: 'Update school information', category: 'school' },
    { name: 'DELETE_SCHOOL', description: 'Delete school', category: 'school' },
    { name: 'MANAGE_SCHOOL_DOMAINS', description: 'Manage school domains', category: 'school' },

    // Student Management
    { name: 'CREATE_STUDENT', description: 'Create new student', category: 'student' },
    { name: 'READ_STUDENT', description: 'View student details', category: 'student' },
    { name: 'UPDATE_STUDENT', description: 'Update student information', category: 'student' },
    { name: 'DELETE_STUDENT', description: 'Delete student', category: 'student' },
    { name: 'BULK_IMPORT_STUDENTS', description: 'Import students in bulk', category: 'student' },
    { name: 'VIEW_STUDENT_DOCUMENTS', description: 'View student documents', category: 'student' },
    { name: 'UPLOAD_STUDENT_PHOTO', description: 'Upload student photo', category: 'student' },

    // Employee Management
    { name: 'CREATE_EMPLOYEE', description: 'Create new employee', category: 'employee' },
    { name: 'READ_EMPLOYEE', description: 'View employee details', category: 'employee' },
    { name: 'UPDATE_EMPLOYEE', description: 'Update employee information', category: 'employee' },
    { name: 'DELETE_EMPLOYEE', description: 'Delete employee', category: 'employee' },
    { name: 'MANAGE_EMPLOYEE_ATTENDANCE', description: 'Manage employee attendance', category: 'employee' },
    { name: 'MANAGE_LEAVES', description: 'Manage employee leaves', category: 'employee' },

    // Attendance
    { name: 'MARK_ATTENDANCE', description: 'Mark student attendance', category: 'attendance' },
    { name: 'VIEW_ATTENDANCE', description: 'View attendance records', category: 'attendance' },
    { name: 'ATTENDANCE_REPORTS', description: 'View attendance reports', category: 'attendance' },

    // Fees Management
    { name: 'CREATE_FEE_TYPE', description: 'Create fee type', category: 'fees' },
    { name: 'MANAGE_FEE_STRUCTURE', description: 'Manage fee structure', category: 'fees' },
    { name: 'COLLECT_FEES', description: 'Collect student fees', category: 'fees' },
    { name: 'VIEW_FEES', description: 'View fee records', category: 'fees' },
    { name: 'MANAGE_FINE', description: 'Manage fine rules', category: 'fees' },
    { name: 'GENERATE_RECEIPTS', description: 'Generate fee receipts', category: 'fees' },

    // Exams
    { name: 'CREATE_EXAM', description: 'Create exam', category: 'exam' },
    { name: 'MANAGE_EXAM_SUBJECTS', description: 'Manage exam subjects', category: 'exam' },
    { name: 'ENTER_MARKS', description: 'Enter student marks', category: 'exam' },
    { name: 'VIEW_RESULTS', description: 'View exam results', category: 'exam' },
    { name: 'GENERATE_REPORT_CARDS', description: 'Generate report cards', category: 'exam' },

    // Classes & Sections
    { name: 'MANAGE_CLASSES', description: 'Create and manage classes', category: 'academic' },
    { name: 'MANAGE_SECTIONS', description: 'Create and manage sections', category: 'academic' },
    { name: 'MANAGE_SUBJECTS', description: 'Manage subjects', category: 'academic' },
    { name: 'ASSIGN_CLASS_TEACHER', description: 'Assign class teachers', category: 'academic' },

    // Timetable
    { name: 'CREATE_TIMETABLE', description: 'Create timetable', category: 'timetable' },
    { name: 'VIEW_TIMETABLE', description: 'View timetable', category: 'timetable' },

    // Payroll
    { name: 'MANAGE_SALARY_STRUCTURE', description: 'Manage salary structure', category: 'payroll' },
    { name: 'PROCESS_PAYROLL', description: 'Process payroll', category: 'payroll' },
    { name: 'GENERATE_PAYSLIPS', description: 'Generate payslips', category: 'payroll' },

    // Reports
    { name: 'VIEW_STUDENT_REPORTS', description: 'View student reports', category: 'reports' },
    { name: 'VIEW_FINANCIAL_REPORTS', description: 'View financial reports', category: 'reports' },
    { name: 'VIEW_ATTENDANCE_REPORTS', description: 'View attendance reports', category: 'reports' },

    // System Settings
    { name: 'MANAGE_ROLES', description: 'Manage roles and permissions', category: 'settings' },
    { name: 'MANAGE_SETTINGS', description: 'Manage system settings', category: 'settings' },
    { name: 'VIEW_AUDIT_LOGS', description: 'View audit logs', category: 'settings' },

    // Subscriptions
    { name: 'CREATE_SUBSCRIPTION_PLAN', description: 'Create subscription plan', category: 'subscription' },
    { name: 'MANAGE_SUBSCRIPTIONS', description: 'Manage school subscriptions', category: 'subscription' },
  ];

  try {
    // ── Roles ──
    console.log('Creating roles...');
    for (const role of roles) {
      await prisma.role.upsert({
        where: { name: role.name },
        update: {},
        create: { name: role.name, description: role.description },
      });
    }
    console.log(`✓ ${roles.length} roles`);

    // ── Permissions ──
    console.log('Creating permissions...');
    for (const permission of permissions) {
      await prisma.permission.upsert({
        where: { name: permission.name },
        update: {},
        create: {
          name: permission.name,
          description: permission.description,
          category: permission.category,
        },
      });
    }
    console.log(`✓ ${permissions.length} permissions`);

    // ── Subscription plan catalog (the plans schools subscribe to) ──
    console.log('Creating subscription plan catalog...');
    const GB = (n: number) => BigInt(n) * BigInt(1024 * 1024 * 1024);
    const planCatalog = [
      { name: 'Free Trial',   price: 0,     billingCycle: 'monthly', maxUsers: 25,   maxStudents: 100,   storageLimit: GB(1),   featureFlags: ['attendance', 'fees'] },
      { name: 'Basic',        price: 2999,  billingCycle: 'monthly', maxUsers: 150,  maxStudents: 1000,  storageLimit: GB(10),  featureFlags: ['attendance', 'fees', 'exams', 'library'] },
      { name: 'Professional', price: 7999,  billingCycle: 'monthly', maxUsers: 500,  maxStudents: 5000,  storageLimit: GB(50),  featureFlags: ['attendance', 'fees', 'exams', 'library', 'transport', 'hr'] },
      { name: 'Enterprise',   price: 19999, billingCycle: 'monthly', maxUsers: 5000, maxStudents: 50000, storageLimit: GB(500), featureFlags: ['attendance', 'fees', 'exams', 'library', 'transport', 'hr', 'inventory', 'hostel', 'communication'] },
    ];
    for (const p of planCatalog) {
      await prisma.subscriptionPlan.upsert({
        where: { name: p.name },
        update: {
          price: p.price, billingCycle: p.billingCycle, maxUsers: p.maxUsers,
          maxStudents: p.maxStudents, storageLimit: p.storageLimit, featureFlags: p.featureFlags,
        },
        create: { ...p, description: `${p.name} plan`, currency: 'INR' },
      });
    }
    console.log(`✓ ${planCatalog.length} subscription plans`);

    // ── Platform tenant + SUPER_ADMIN ──
    // A User must belong to a school, so the platform owner lives in a dedicated
    // "platform" tenant. This is infrastructure, not a demo school.
    console.log('Creating platform tenant & super admin...');
    const platform = await prisma.school.upsert({
      where: { email: 'platform@globalschoolmitra.com' },
      update: {},
      create: {
        name: 'Global School Mitra Platform',
        slug: 'platform',
        email: 'platform@globalschoolmitra.com',
        isActive: true,
      },
    });
    await prisma.user.upsert({
      where: { email_schoolId: { email: SUPER_ADMIN_EMAIL, schoolId: platform.id } },
      update: { password: hashedPassword, role: 'SUPER_ADMIN', isActive: true },
      create: {
        schoolId: platform.id,
        firstName: 'Super',
        lastName: 'Admin',
        email: SUPER_ADMIN_EMAIL,
        password: hashedPassword,
        role: 'SUPER_ADMIN',
        isActive: true,
        emailVerified: true,
      },
    });
    console.log(`✓ Super admin ready: ${SUPER_ADMIN_EMAIL}`);

    console.log('✓ Production seed completed successfully');
  } catch (error) {
    console.error('Seeding error:', error);
    throw error;
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
