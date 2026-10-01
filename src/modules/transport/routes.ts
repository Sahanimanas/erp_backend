import { Router } from 'express';
import transportController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();
const ADMIN = ['SCHOOL_ADMIN', 'PRINCIPAL'] as const;

// Vehicles
router.get('/vehicles', requireAuth, (req, res) => transportController.listVehicles(req, res));
router.post('/vehicles', requireAuth, requireRole(...ADMIN), (req, res) => transportController.upsertVehicle(req, res));
router.delete('/vehicles/:id', requireAuth, requireRole(...ADMIN), (req, res) => transportController.deleteVehicle(req, res));

// Drivers
router.get('/drivers', requireAuth, (req, res) => transportController.listDrivers(req, res));
router.post('/drivers', requireAuth, requireRole(...ADMIN), (req, res) => transportController.upsertDriver(req, res));
router.delete('/drivers/:id', requireAuth, requireRole(...ADMIN), (req, res) => transportController.deleteDriver(req, res));

// Stoppages
router.get('/stoppages', requireAuth, (req, res) => transportController.listStoppages(req, res));
router.post('/stoppages', requireAuth, requireRole(...ADMIN), (req, res) => transportController.upsertStoppage(req, res));
router.delete('/stoppages/:id', requireAuth, requireRole(...ADMIN), (req, res) => transportController.deleteStoppage(req, res));

// Routes — the SAME rows Fee Management reads/writes; this endpoint owns the
// operational columns, /fee-management/routes owns the fee.
router.get('/routes', requireAuth, (req, res) => transportController.listRoutes(req, res));
router.post('/routes', requireAuth, requireRole(...ADMIN), (req, res) => transportController.upsertRoute(req, res));
router.delete('/routes/:id', requireAuth, requireRole(...ADMIN), (req, res) => transportController.deleteRoute(req, res));

// Stoppages on a route
router.get('/route-stoppages', requireAuth, (req, res) => transportController.listRouteStoppages(req, res));
router.post('/route-stoppages', requireAuth, requireRole(...ADMIN), (req, res) => transportController.addRouteStoppage(req, res));
router.delete('/route-stoppages/:id', requireAuth, requireRole(...ADMIN), (req, res) => transportController.deleteRouteStoppage(req, res));

// Students on a route
router.get('/student-routes', requireAuth, (req, res) => transportController.listStudentRoutes(req, res));
router.post('/student-routes', requireAuth, requireRole(...ADMIN), (req, res) => transportController.assignStudents(req, res));
router.delete('/student-routes/:id', requireAuth, requireRole(...ADMIN), (req, res) => transportController.unassignStudent(req, res));

// Report
router.get('/student-report', requireAuth, (req, res) => transportController.studentReport(req, res));

// Live GPS tracking — device/driver POSTs location; student/admin GET live snapshot.
router.get('/routes/:id/live', requireAuth, (req, res) => transportController.getRouteLive(req, res));
router.post('/routes/:id/location', requireAuth, (req, res) => transportController.updateRouteLocation(req, res));

export default router;
