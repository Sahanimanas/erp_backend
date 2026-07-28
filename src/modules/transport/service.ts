import { db } from '@common/database/client';

/**
 * Transport Management.
 *
 * Routes live in the SAME TransportRoute table that Fee Management writes to —
 * that screen owns `fee`, this module owns the operational columns. A route
 * created on either screen is immediately visible on the other, so there is
 * exactly one list of routes in the system.
 */

const str = (v: any) => (v === undefined || v === null ? undefined : String(v).trim());
const req = (v: any, label: string) => {
  const s = str(v);
  if (!s) throw new Error(`${label} is required`);
  return s;
};
const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fullName = (u?: { firstName?: string | null; lastName?: string | null } | null) =>
  u ? [u.firstName, u.lastName].filter(Boolean).join(' ').trim() : '';

export class TransportService {
  // ── Vehicles ──────────────────────────────────────────────────────────────
  async listVehicles(schoolId: string) {
    return db.transportVehicle.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async upsertVehicle(schoolId: string, data: any) {
    const payload = {
      name: req(data.name, 'Vehicle name'),
      vehicleNumber: req(data.vehicleNumber, 'Vehicle number'),
      vehicleModel: str(data.vehicleModel) || null,
      gpsDeviceId: str(data.gpsDeviceId) || null,
      seatCapacity: Math.max(0, Math.round(num(data.seatCapacity))),
      enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    };
    if (data.id) {
      const found = await db.transportVehicle.findFirst({ where: { id: data.id, schoolId } });
      if (!found) throw new Error('Vehicle not found');
      return db.transportVehicle.update({ where: { id: data.id }, data: payload });
    }
    // Vehicle number is unique per school — reuse the row instead of erroring so
    // re-submitting the same bus updates it rather than blowing up.
    const existing = await db.transportVehicle.findFirst({
      where: { schoolId, vehicleNumber: payload.vehicleNumber, deletedAt: null },
    });
    if (existing) return db.transportVehicle.update({ where: { id: existing.id }, data: payload });
    return db.transportVehicle.create({ data: { schoolId, ...payload } });
  }

  async deleteVehicle(schoolId: string, id: string) {
    const found = await db.transportVehicle.findFirst({ where: { id, schoolId } });
    if (!found) throw new Error('Vehicle not found');
    const inUse = await db.transportRoute.count({ where: { vehicleId: id, deletedAt: null } });
    if (inUse) throw new Error('Vehicle is assigned to a route — reassign the route first');
    await db.transportVehicle.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  // ── Drivers ───────────────────────────────────────────────────────────────
  async listDrivers(schoolId: string) {
    return db.transportDriver.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async upsertDriver(schoolId: string, data: any) {
    const age = data.age === undefined || data.age === null || data.age === '' ? null : Math.round(num(data.age));
    const payload = {
      name: req(data.name, 'Driver name'),
      licenseNo: req(data.licenseNo, 'Driving licence no'),
      phone: str(data.phone) || null,
      email: str(data.email) || null,
      age,
      address: str(data.address) || null,
      enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    };
    if (data.id) {
      const found = await db.transportDriver.findFirst({ where: { id: data.id, schoolId } });
      if (!found) throw new Error('Driver not found');
      return db.transportDriver.update({ where: { id: data.id }, data: payload });
    }
    return db.transportDriver.create({ data: { schoolId, ...payload } });
  }

  async deleteDriver(schoolId: string, id: string) {
    const found = await db.transportDriver.findFirst({ where: { id, schoolId } });
    if (!found) throw new Error('Driver not found');
    const inUse = await db.transportRoute.count({ where: { driverId: id, deletedAt: null } });
    if (inUse) throw new Error('Driver is assigned to a route — reassign the route first');
    await db.transportDriver.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  // ── Stoppages ─────────────────────────────────────────────────────────────
  async listStoppages(schoolId: string) {
    return db.transportStoppage.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async upsertStoppage(schoolId: string, data: any) {
    const toCoord = (v: any) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const payload = {
      name: req(data.name, 'Stop name'),
      latitude: toCoord(data.latitude),
      longitude: toCoord(data.longitude),
      enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    };
    if (data.id) {
      const found = await db.transportStoppage.findFirst({ where: { id: data.id, schoolId } });
      if (!found) throw new Error('Stoppage not found');
      return db.transportStoppage.update({ where: { id: data.id }, data: payload });
    }
    const existing = await db.transportStoppage.findFirst({
      where: { schoolId, name: payload.name, deletedAt: null },
    });
    if (existing) return db.transportStoppage.update({ where: { id: existing.id }, data: payload });
    return db.transportStoppage.create({ data: { schoolId, ...payload } });
  }

  async deleteStoppage(schoolId: string, id: string) {
    const found = await db.transportStoppage.findFirst({ where: { id, schoolId } });
    if (!found) throw new Error('Stoppage not found');
    const inUse = await db.transportRouteStoppage.count({ where: { stoppageId: id, deletedAt: null } });
    if (inUse) throw new Error('Stoppage is used by a route — remove it from the route first');
    await db.transportStoppage.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  /**
   * Routes with their vehicle/driver/staff resolved to display names. `fee` is
   * BigInt in the DB (Fee Management owns it) — serialised to Number here so it
   * survives JSON without a custom replacer.
   */
  async listRoutes(schoolId: string) {
    const routes = await db.transportRoute.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: {
        vehicle: { select: { id: true, name: true, vehicleNumber: true } },
        driver: { select: { id: true, name: true } },
        _count: { select: { stoppages: true, students: true } },
      },
    });

    // Staff is an Employee id; resolve the names in one query rather than N.
    const staffIds = Array.from(new Set(routes.map((r) => r.staffId).filter(Boolean))) as string[];
    const staff = staffIds.length
      ? await db.employee.findMany({
          where: { id: { in: staffIds }, schoolId },
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        })
      : [];
    const staffName = new Map(staff.map((e) => [e.id, fullName(e.user)]));

    return routes.map((r) => ({
      ...r,
      fee: Number(r.fee),
      vehicleName: r.vehicle ? r.vehicle.name : null,
      driverName: r.driver ? r.driver.name : null,
      staffName: r.staffId ? staffName.get(r.staffId) || null : null,
      stoppageCount: r._count.stoppages,
      studentCount: r._count.students,
    }));
  }

  /**
   * Create/update a route, including its monthly fee — Transport is now the one
   * place routes are managed. `fee` is only written when the caller actually
   * sends it, so a partial save can never silently zero an existing fee (the
   * payments ledger bills from this column).
   */
  async upsertRoute(schoolId: string, data: any) {
    const name = req(data.name, 'Route name');
    const feeGiven = data.fee !== undefined && data.fee !== null && data.fee !== '';
    const base = {
      name,
      routeFrom: str(data.routeFrom) || null,
      routeTo: str(data.routeTo) || null,
      vehicleId: str(data.vehicleId) || null,
      driverId: str(data.driverId) || null,
      staffId: str(data.staffId) || null,
      enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    };
    // Spread conditionally rather than widening `base` to Record<string, any> —
    // that would erase `name` from the inferred type and break Prisma's create input.
    const payload = feeGiven
      ? { ...base, fee: BigInt(Math.max(0, Math.round(Number(data.fee) || 0))) }
      : base;

    if (data.id) {
      const found = await db.transportRoute.findFirst({ where: { id: data.id, schoolId } });
      if (!found) throw new Error('Route not found');
      return db.transportRoute.update({ where: { id: data.id }, data: payload });
    }
    // Route names are unique per school, and Fee Management may have already
    // created this one (name + fee only) — fill in the operational detail
    // instead of failing on the unique constraint.
    const existing = await db.transportRoute.findFirst({ where: { schoolId, name, deletedAt: null } });
    if (existing) return db.transportRoute.update({ where: { id: existing.id }, data: payload });
    return db.transportRoute.create({ data: { schoolId, ...payload } });
  }

  async deleteRoute(schoolId: string, id: string) {
    const found = await db.transportRoute.findFirst({ where: { id, schoolId } });
    if (!found) throw new Error('Route not found');
    const riding = await db.transportStudentRoute.count({ where: { routeId: id, deletedAt: null } });
    if (riding) throw new Error(`${riding} student(s) are assigned to this route — unassign them first`);
    await db.transportRoute.update({ where: { id }, data: { deletedAt: new Date() } });
    return { id };
  }

  // ── Stoppages on a route ──────────────────────────────────────────────────
  async listRouteStoppages(schoolId: string, routeId?: string) {
    return db.transportRouteStoppage.findMany({
      where: { schoolId, deletedAt: null, ...(routeId ? { routeId } : {}) },
      orderBy: [{ routeId: 'asc' }, { sequenceNo: 'asc' }],
      include: {
        route: { select: { id: true, name: true } },
        stoppage: { select: { id: true, name: true, latitude: true, longitude: true } },
      },
    });
  }

  async addRouteStoppage(schoolId: string, data: any) {
    const routeId = req(data.routeId, 'Route');
    const stoppageId = req(data.stoppageId, 'Stoppage');

    const route = await db.transportRoute.findFirst({ where: { id: routeId, schoolId, deletedAt: null } });
    if (!route) throw new Error('Route not found');
    const stop = await db.transportStoppage.findFirst({ where: { id: stoppageId, schoolId, deletedAt: null } });
    if (!stop) throw new Error('Stoppage not found');

    const stopType = ['START_POINT', 'STOPPAGE_POINT', 'END_POINT'].includes(data.stopType)
      ? data.stopType
      : 'STOPPAGE_POINT';
    const payload = {
      time: str(data.time) || null,
      sequenceNo: Math.max(0, Math.round(num(data.sequenceNo))),
      stopType,
      enabled: data.enabled === undefined ? true : Boolean(data.enabled),
    };

    // A stop can appear on a route only once — re-adding updates its time/order.
    const existing = await db.transportRouteStoppage.findFirst({ where: { routeId, stoppageId } });
    if (existing) {
      return db.transportRouteStoppage.update({
        where: { id: existing.id },
        data: { ...payload, deletedAt: null },
      });
    }
    return db.transportRouteStoppage.create({ data: { schoolId, routeId, stoppageId, ...payload } });
  }

  async deleteRouteStoppage(schoolId: string, id: string) {
    const found = await db.transportRouteStoppage.findFirst({ where: { id, schoolId } });
    if (!found) throw new Error('Route stoppage not found');
    const riding = await db.transportStudentRoute.count({ where: { stoppageId: found.stoppageId, routeId: found.routeId, deletedAt: null } });
    if (riding) throw new Error(`${riding} student(s) board at this stop — unassign them first`);
    await db.transportRouteStoppage.delete({ where: { id } });
    return { id };
  }

  // ── Students on a route ───────────────────────────────────────────────────
  async listStudentRoutes(schoolId: string, routeId?: string) {
    const rows = await db.transportStudentRoute.findMany({
      where: { schoolId, deletedAt: null, ...(routeId ? { routeId } : {}) },
      orderBy: { updatedAt: 'desc' },
      include: {
        route: { select: { id: true, name: true } },
        stoppage: { select: { id: true, name: true } },
        student: {
          select: {
            id: true,
            registrationNo: true,
            admissionNumber: true,
            user: { select: { firstName: true, lastName: true, phone: true } },
            section: { select: { name: true, class: { select: { name: true } } } },
          },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      routeId: r.routeId,
      routeName: r.route?.name || '',
      stoppageId: r.stoppageId,
      stoppageName: r.stoppage?.name || '',
      studentId: r.studentId,
      studentName: fullName(r.student?.user),
      phone: r.student?.user?.phone || '',
      registrationNo: r.student?.registrationNo || r.student?.admissionNumber || '',
      className: r.student?.section
        ? `${r.student.section.class?.name || ''}${r.student.section.name ? ` [${r.student.section.name}]` : ''}`.trim()
        : '',
      academicYearId: r.academicYearId,
      updatedAt: r.updatedAt,
    }));
  }

  /**
   * Assign one or more students to a route + stop. A student rides one route per
   * session, so re-assigning MOVES them rather than creating a duplicate.
   */
  async assignStudents(schoolId: string, data: any) {
    const routeId = req(data.routeId, 'Route');
    const stoppageId = req(data.stoppageId, 'Stoppage');
    const academicYearId = str(data.academicYearId) || null;
    const studentIds: string[] = Array.isArray(data.studentIds)
      ? data.studentIds.map((s: any) => String(s)).filter(Boolean)
      : [];
    if (!studentIds.length) throw new Error('Select at least one student');

    const link = await db.transportRouteStoppage.findFirst({
      where: { routeId, stoppageId, schoolId, deletedAt: null },
    });
    if (!link) throw new Error('That stoppage is not on this route — assign it to the route first');

    const students = await db.student.findMany({
      where: { id: { in: studentIds }, schoolId },
      select: { id: true },
    });
    if (students.length !== studentIds.length) throw new Error('One or more students were not found');

    let assigned = 0;
    for (const sid of studentIds) {
      const existing = await db.transportStudentRoute.findFirst({
        where: { studentId: sid, academicYearId },
      });
      if (existing) {
        await db.transportStudentRoute.update({
          where: { id: existing.id },
          data: { routeId, stoppageId, schoolId, deletedAt: null },
        });
      } else {
        await db.transportStudentRoute.create({
          data: { schoolId, routeId, stoppageId, studentId: sid, academicYearId },
        });
      }
      assigned++;
    }

    // Keep the legacy Student.transportRoute name in step so the existing fee
    // ledger (which still matches routes by name) bills these students.
    const route = await db.transportRoute.findFirst({ where: { id: routeId, schoolId } });
    if (route) {
      await db.student.updateMany({
        where: { id: { in: studentIds }, schoolId },
        data: { transportAllotted: true, transportRoute: route.name },
      });
    }

    return { assigned };
  }

  async unassignStudent(schoolId: string, id: string) {
    const found = await db.transportStudentRoute.findFirst({ where: { id, schoolId } });
    if (!found) throw new Error('Assignment not found');
    await db.transportStudentRoute.delete({ where: { id } });
    // Clear the legacy name link too, or the student keeps getting billed.
    await db.student.updateMany({
      where: { id: found.studentId, schoolId },
      data: { transportAllotted: false, transportRoute: null },
    });
    return { id };
  }

  // ── Report ────────────────────────────────────────────────────────────────
  /** Every student on transport, optionally filtered by route or stop. */
  async studentReport(schoolId: string, filters: { routeId?: string; stoppageId?: string }) {
    const rows = await this.listStudentRoutes(schoolId, filters.routeId);
    return filters.stoppageId ? rows.filter((r) => r.stoppageId === filters.stoppageId) : rows;
  }
}

export default new TransportService();
