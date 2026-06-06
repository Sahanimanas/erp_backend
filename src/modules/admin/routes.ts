import { Router } from 'express';
import adminController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

/**
 * Super Admin Only Routes
 */

// Schools
router.post('/', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.createSchool(req, res);
});

router.get('/', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.listSchools(req, res);
});

router.get('/:schoolId', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.getSchoolById(req, res);
});

router.put('/:schoolId', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.updateSchool(req, res);
});

router.patch('/:schoolId/deactivate', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.deactivateSchool(req, res);
});

router.patch('/:schoolId/activate', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.activateSchool(req, res);
});

router.delete('/:schoolId', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.deleteSchool(req, res);
});

/**
 * Subscription Plans
 */

router.post('/plans', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.createSubscriptionPlan(req, res);
});

router.get('/plans', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.listSubscriptionPlans(req, res);
});

router.get('/plans/:planId', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.getSubscriptionPlanById(req, res);
});

router.put('/plans/:planId', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.updateSubscriptionPlan(req, res);
});

/**
 * Subscriptions
 */

router.post('/subscriptions', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.assignSubscription(req, res);
});

router.get('/subscriptions/:schoolId', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.getSchoolSubscription(req, res);
});

/**
 * Domains
 */

router.post('/domains', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.createDomain(req, res);
});

router.get('/:schoolId/domains', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.listSchoolDomains(req, res);
});

router.delete('/domains/:domainId', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.deleteDomain(req, res);
});

/**
 * Analytics
 */

router.get('/analytics/dashboard', requireAuth, requireRole('SUPER_ADMIN'), async (req, res) => {
  await adminController.getDashboardAnalytics(req, res);
});

export default router;
