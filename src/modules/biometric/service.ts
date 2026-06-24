import crypto from 'crypto';
import { db } from '@common/database/client';
import {
  RegisterDeviceRequest,
  UpdateDeviceRequest,
  EnrollStudentRequest,
  NormalizedPunch,
  IngestResult,
  Modality,
  Direction,
} from './types';

const MODALITIES: Modality[] = ['RFID', 'FINGERPRINT', 'FACE'];
const normModality = (m: any): Modality =>
  MODALITIES.includes(String(m).toUpperCase() as Modality)
    ? (String(m).toUpperCase() as Modality)
    : 'FINGERPRINT';

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayEnd = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);

export class BiometricService {
  // ── Devices ───────────────────────────────────────────────────────────────

  async registerDevice(schoolId: string, data: RegisterDeviceRequest) {
    if (!data.name || !data.modality) throw new Error('name and modality are required');
    return db.biometricDevice.create({
      data: {
        schoolId,
        name: data.name,
        modality: normModality(data.modality),
        serialNumber: data.serialNumber || null,
        ipAddress: data.ipAddress || null,
        location: data.location || null,
        lateAfterMinutes: data.lateAfterMinutes ?? 540,
        apiKey: this.generateKey(),
      },
    });
  }

  async listDevices(schoolId: string) {
    return db.biometricDevice.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { enrollments: true, punches: true } } },
    });
  }

  async updateDevice(schoolId: string, deviceId: string, data: UpdateDeviceRequest) {
    await this.assertDevice(schoolId, deviceId);
    return db.biometricDevice.update({
      where: { id: deviceId },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.serialNumber !== undefined && { serialNumber: data.serialNumber }),
        ...(data.ipAddress !== undefined && { ipAddress: data.ipAddress }),
        ...(data.location !== undefined && { location: data.location }),
        ...(data.lateAfterMinutes !== undefined && { lateAfterMinutes: data.lateAfterMinutes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async rotateKey(schoolId: string, deviceId: string) {
    await this.assertDevice(schoolId, deviceId);
    return db.biometricDevice.update({
      where: { id: deviceId },
      data: { apiKey: this.generateKey() },
    });
  }

  async deleteDevice(schoolId: string, deviceId: string) {
    await this.assertDevice(schoolId, deviceId);
    await db.biometricDevice.delete({ where: { id: deviceId } });
  }

  // ── Enrollments (device identity → student) ────────────────────────────────

  async enrollStudent(schoolId: string, data: EnrollStudentRequest) {
    if (!data.studentId) throw new Error('studentId is required');
    if (!data.deviceUserId && !data.cardNumber) {
      throw new Error('Provide a deviceUserId and/or a cardNumber');
    }
    const student = await db.student.findFirst({ where: { id: data.studentId, schoolId } });
    if (!student) throw new Error('Student not found');

    return db.biometricEnrollment.create({
      data: {
        schoolId,
        studentId: data.studentId,
        modality: normModality(data.modality),
        deviceUserId: data.deviceUserId || null,
        cardNumber: data.cardNumber || null,
        deviceId: data.deviceId || null,
      },
      include: this.enrollmentInclude(),
    });
  }

  async listEnrollments(schoolId: string) {
    return db.biometricEnrollment.findMany({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
      include: this.enrollmentInclude(),
    });
  }

  async deleteEnrollment(schoolId: string, id: string) {
    const e = await db.biometricEnrollment.findFirst({ where: { id, schoolId } });
    if (!e) throw new Error('Enrollment not found');
    await db.biometricEnrollment.delete({ where: { id } });
  }

  // ── Punch log / reporting ──────────────────────────────────────────────────

  async listPunches(
    schoolId: string,
    opts: { date?: string; deviceId?: string; page?: number; limit?: number } = {}
  ) {
    const page = opts.page || 1;
    const limit = opts.limit || 50;
    const where: any = { schoolId };
    if (opts.deviceId) where.deviceId = opts.deviceId;
    if (opts.date) {
      const d = new Date(opts.date);
      if (!isNaN(d.getTime())) where.eventTime = { gte: dayStart(d), lt: dayEnd(d) };
    }

    const [data, total] = await Promise.all([
      db.attendancePunch.findMany({
        where,
        orderBy: { eventTime: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          device: { select: { name: true, modality: true } },
          student: {
            select: { id: true, rollNumber: true, user: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
      db.attendancePunch.count({ where }),
    ]);
    return { data, pagination: { total } };
  }

  // ── Ingest (called by the public device endpoint) ──────────────────────────

  /**
   * Resolve the device by its API key, normalize the raw vendor payload, store
   * the punch, and (when it resolves to a student) upsert the day's attendance.
   */
  async ingest(apiKey: string, payload: any): Promise<IngestResult | { ignored: true }> {
    if (!apiKey) throw new Error('Missing device key');
    const device = await db.biometricDevice.findUnique({ where: { apiKey } });
    if (!device || !device.isActive) throw new Error('Invalid or inactive device key');

    await db.biometricDevice.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    const punch = this.normalize(payload);
    // Heartbeat / keep-alive events carry no identity — acknowledge & skip.
    if (!punch.deviceUserId && !punch.cardNumber) return { ignored: true };

    // Resolve the student via enrollment (device user id first, then card).
    const enrollment = await db.biometricEnrollment.findFirst({
      where: {
        schoolId: device.schoolId,
        OR: [
          ...(punch.deviceUserId ? [{ deviceUserId: punch.deviceUserId }] : []),
          ...(punch.cardNumber ? [{ cardNumber: punch.cardNumber }] : []),
        ],
      },
    });

    const created = await db.attendancePunch.create({
      data: {
        schoolId: device.schoolId,
        deviceId: device.id,
        studentId: enrollment?.studentId ?? null,
        rawUserId: punch.deviceUserId ?? null,
        cardNumber: punch.cardNumber ?? null,
        modality: device.modality,
        direction: punch.direction,
        eventTime: punch.eventTime,
        matched: Boolean(enrollment),
        raw: this.safeJson(payload),
      },
    });

    if (!enrollment) {
      return { matched: false, punchId: created.id };
    }

    const status = await this.applyDailyAttendance(
      device.schoolId,
      enrollment.studentId,
      punch.eventTime,
      device.lateAfterMinutes
    );

    return { matched: true, studentId: enrollment.studentId, status, punchId: created.id };
  }

  /**
   * Upsert the student's daily attendance from a punch. First punch of the day
   * creates the row (PRESENT, or LATE if past the device's cutoff). A later
   * punch never downgrades an already-present student; it only promotes a row
   * previously marked ABSENT.
   */
  private async applyDailyAttendance(
    schoolId: string,
    studentId: string,
    eventTime: Date,
    lateAfterMinutes: number
  ): Promise<string> {
    const minuteOfDay = eventTime.getHours() * 60 + eventTime.getMinutes();
    const status = minuteOfDay >= lateAfterMinutes ? 'LATE' : 'PRESENT';
    const date = dayStart(eventTime);

    const existing = await db.studentAttendance.findFirst({
      where: { schoolId, studentId, date: { gte: date, lt: dayEnd(eventTime) } },
    });

    if (!existing) {
      await db.studentAttendance.create({
        data: { schoolId, studentId, date, status, remarks: 'Auto (device)' },
      });
      return status;
    }

    if (existing.status === 'ABSENT') {
      await db.studentAttendance.update({ where: { id: existing.id }, data: { status } });
      return status;
    }
    return existing.status;
  }

  // ── Payload normalization (vendor-agnostic) ────────────────────────────────

  /**
   * Map a raw device payload to a NormalizedPunch. Supports a simple generic
   * JSON shape and Hikvision's AccessControllerEvent format. Falls back to
   * sensible defaults so a slightly different firmware still resolves.
   */
  private normalize(payload: any): NormalizedPunch {
    const p = payload || {};
    const ev = p.AccessControllerEvent || p.accessControllerEvent || {};

    const deviceUserId = this.firstString(
      ev.employeeNoString,
      ev.employeeNo,
      p.employeeNoString,
      p.employeeNo,
      p.personId,
      p.userId,
      p.userID,
      p.pin
    );

    const cardNumber = this.firstString(ev.cardNo, p.cardNo, p.cardNumber, p.card);

    const timeRaw = this.firstString(
      p.dateTime,
      p.eventTime,
      p.time,
      ev.time,
      ev.dateTime
    );
    const parsed = timeRaw ? new Date(timeRaw) : new Date();
    const eventTime = isNaN(parsed.getTime()) ? new Date() : parsed;

    const serialNumber = this.firstString(p.deviceID, p.deviceId, p.serialNo, ev.serialNo, p.ipAddress);

    const dirRaw = String(
      p.direction || p.attendanceStatus || ev.attendanceStatus || ''
    ).toLowerCase();
    const direction: Direction =
      dirRaw.includes('out') || dirRaw === 'checkout' ? 'OUT' : 'IN';

    return { deviceUserId, cardNumber, eventTime, direction, serialNumber };
  }

  // ── helpers ────────────────────────────────────────────────────────────────

  private generateKey(): string {
    return 'dev_' + crypto.randomBytes(24).toString('hex');
  }

  private firstString(...vals: any[]): string | undefined {
    for (const v of vals) {
      if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
    }
    return undefined;
  }

  private safeJson(payload: any): any {
    try {
      return JSON.parse(JSON.stringify(payload));
    } catch {
      return undefined;
    }
  }

  private enrollmentInclude() {
    return {
      student: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      device: { select: { id: true, name: true } },
    };
  }

  private async assertDevice(schoolId: string, deviceId: string) {
    const device = await db.biometricDevice.findFirst({ where: { id: deviceId, schoolId } });
    if (!device) throw new Error('Device not found');
    return device;
  }
}

export default new BiometricService();
