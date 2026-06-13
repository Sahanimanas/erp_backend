import { Router } from 'express';
import adminController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

// Every route in this module is Super Admin only. `requireRole` runs after the
// global `authenticate` middleware (mounted in app.ts), and SUPER_ADMIN is the
// only role allowed to operate across tenants.
router.use(requireAuth, requireRole('SUPER_ADMIN'));

// ── Metadata ───────────────────────────────────────────────────────────────
router.get('/modules', (req, res) => adminController.listModules(req, res));

// ── Analytics ────────────────────────────────────────────────────────────────
router.get('/analytics', (req, res) => adminController.getDashboardAnalytics(req, res));
router.get('/analytics/dashboard', (req, res) => adminController.getDashboardAnalytics(req, res));

// ── Audit logs ───────────────────────────────────────────────────────────────
router.get('/audit-logs', (req, res) => adminController.listAuditLogs(req, res));

// ── Subdomain availability (before /schools/:schoolId to avoid shadowing) ─────
router.post('/schools/check-subdomain', (req, res) => adminController.checkSubdomain(req, res));
router.get('/schools/check-subdomain', (req, res) => adminController.checkSubdomain(req, res));

// ── Subscription Plans ────────────────────────────────────────────────────────
router.post('/plans', (req, res) => adminController.createSubscriptionPlan(req, res));
router.get('/plans', (req, res) => adminController.listSubscriptionPlans(req, res));
router.get('/plans/:planId', (req, res) => adminController.getSubscriptionPlanById(req, res));
router.put('/plans/:planId', (req, res) => adminController.updateSubscriptionPlan(req, res));

// ── Subscriptions ─────────────────────────────────────────────────────────────
router.post('/subscriptions', (req, res) => adminController.assignSubscription(req, res));
router.get('/subscriptions/:schoolId', (req, res) => adminController.getSchoolSubscription(req, res));

// ── Domains (platform-wide + verify/remove) ──────────────────────────────────
router.get('/domains', (req, res) => adminController.listAllDomains(req, res));
router.post('/domains', (req, res) => adminController.createDomain(req, res));
router.post('/domains/:domainId/verify', (req, res) => adminController.verifyDomain(req, res));
router.delete('/domains/:domainId', (req, res) => adminController.deleteDomain(req, res));

// ── Schools (collection) ──────────────────────────────────────────────────────
router.post('/schools', (req, res) => adminController.createSchool(req, res));
router.get('/schools', (req, res) => adminController.listSchools(req, res));

// Backwards-compatible aliases (the original module mounted CRUD at the root).
router.post('/', (req, res) => adminController.createSchool(req, res));
router.get('/', (req, res) => adminController.listSchools(req, res));

// ── Schools (item) ────────────────────────────────────────────────────────────
router.get('/schools/:schoolId', (req, res) => adminController.getSchoolById(req, res));
router.put('/schools/:schoolId', (req, res) => adminController.updateSchool(req, res));
router.patch('/schools/:schoolId', (req, res) => adminController.updateSchool(req, res));
router.delete('/schools/:schoolId', (req, res) => adminController.deleteSchool(req, res));
router.patch('/schools/:schoolId/activate', (req, res) => adminController.activateSchool(req, res));
router.patch('/schools/:schoolId/suspend', (req, res) => adminController.deactivateSchool(req, res));
router.patch('/schools/:schoolId/deactivate', (req, res) => adminController.deactivateSchool(req, res));
router.patch('/schools/:schoolId/modules', (req, res) => adminController.updateSchoolModules(req, res));
router.get('/schools/:schoolId/users', (req, res) => adminController.getSchoolUsers(req, res));
router.get('/schools/:schoolId/domains', (req, res) => adminController.listSchoolDomains(req, res));
router.post('/schools/:schoolId/login-as', (req, res) => adminController.loginAsSchoolAdmin(req, res));
router.post('/schools/:schoolId/reset-password', (req, res) => adminController.resetSchoolAdminPassword(req, res));

export default router;
