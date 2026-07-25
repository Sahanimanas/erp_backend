import { db } from '@common/database/client';
import studentService from '@modules/student/service';
import { CreateEnquiryRequest, UpdateEnquiryRequest, ListEnquiriesQuery } from './types';

const STATUSES = ['ENQUIRY', 'CONTACTED', 'REGISTERED', 'ADMITTED', 'REJECTED'] as const;

const toDate = (v: any): Date | undefined => {
  if (!v) return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
};

const PHONE_RE = /^[0-9]{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

/** Mirrors the enquiry form's client-side rules so the API can't be bypassed. */
const assertPhone = (phone: string) => {
  if (!PHONE_RE.test(phone)) throw new Error('Phone number must be exactly 10 digits');
};
const assertEmail = (email: string) => {
  if (email && !EMAIL_RE.test(email)) throw new Error('Please provide a valid email address');
};

export class AdmissionService {
  async createEnquiry(schoolId: string, data: CreateEnquiryRequest) {
    if (!data.studentName || !data.phone) {
      throw new Error('Student name and phone are required');
    }
    const phone = String(data.phone).trim();
    const email = data.email ? String(data.email).trim() : undefined;
    assertPhone(phone);
    assertEmail(email || '');
    return db.admissionEnquiry.create({
      data: {
        schoolId,
        studentName: data.studentName.trim(),
        gender: data.gender,
        dateOfBirth: toDate(data.dateOfBirth),
        classApplying: data.classApplying,
        parentName: data.parentName,
        phone,
        email: email || undefined,
        address: data.address,
        source: data.source || 'Walk-in',
        reference: data.reference,
        followUpDate: toDate(data.followUpDate),
        notes: data.notes,
        status: (data.status as any) || 'ENQUIRY',
      },
    });
  }

  async listEnquiries(schoolId: string, query: ListEnquiriesQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const where: any = { schoolId, deletedAt: null };
    if (query.status && query.status !== 'all') where.status = query.status;
    if (query.classApplying) where.classApplying = query.classApplying;
    if (query.search) {
      where.OR = [
        { studentName: { contains: query.search, mode: 'insensitive' } },
        { parentName: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { registrationNo: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    const from = toDate(query.fromDate);
    const to = toDate(query.toDate);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = from;
      if (to) where.createdAt.lte = new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1);
    }

    const [data, total] = await Promise.all([
      db.admissionEnquiry.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      db.admissionEnquiry.count({ where }),
    ]);

    return { data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async getEnquiry(schoolId: string, id: string) {
    const e = await db.admissionEnquiry.findFirst({ where: { id, schoolId, deletedAt: null } });
    if (!e) throw new Error('Enquiry not found');
    return e;
  }

  async updateEnquiry(schoolId: string, id: string, data: UpdateEnquiryRequest) {
    await this.getEnquiry(schoolId, id);

    const update: any = { ...data };
    // Only validate contact fields the caller actually sent — status-only PATCHes
    // (the stage dropdown) must not trip over legacy rows.
    if (data.phone !== undefined) {
      update.phone = String(data.phone).trim();
      assertPhone(update.phone);
    }
    if (data.email !== undefined) {
      update.email = String(data.email).trim();
      assertEmail(update.email);
      if (!update.email) update.email = null;
    }
    if (data.dateOfBirth !== undefined) update.dateOfBirth = toDate(data.dateOfBirth);
    if (data.followUpDate !== undefined) update.followUpDate = toDate(data.followUpDate);
    if (data.status && !STATUSES.includes(data.status as any)) delete update.status;

    // Auto-allocate a registration number when an enquiry is first registered.
    if (data.status === 'REGISTERED') {
      const current = await db.admissionEnquiry.findUnique({ where: { id } });
      if (current && !current.registrationNo) {
        update.registrationNo = await this.nextRegistrationNo(schoolId);
      }
    }

    return db.admissionEnquiry.update({ where: { id }, data: update });
  }

  async deleteEnquiry(schoolId: string, id: string) {
    await this.getEnquiry(schoolId, id);
    await db.admissionEnquiry.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Enquiry deleted' };
  }

  /**
   * Convert an enquiry into a real Student (admission → student bridge). Creates
   * the Student + login via the student service, marks the enquiry ADMITTED, and
   * links them. After this, the student flows into every panel (dashboard counts,
   * attendance rosters, fee structure by class) because they share the Student table.
   */
  async admitEnquiry(
    schoolId: string,
    id: string,
    data: { classId: string; sectionName?: string; rollNumber: string; dateOfBirth?: string }
  ) {
    const enquiry = await this.getEnquiry(schoolId, id);
    if (enquiry.admittedStudentId) throw new Error('This enquiry has already been admitted');
    if (!data.classId || !data.rollNumber) throw new Error('Class and roll number are required to admit');

    const [firstName, ...rest] = (enquiry.studentName || 'Student').trim().split(/\s+/);
    const dob = data.dateOfBirth || (enquiry.dateOfBirth ? enquiry.dateOfBirth.toISOString().slice(0, 10) : undefined);
    if (!dob) throw new Error('Date of birth is required to admit (set it on the enquiry or in the admit form)');

    const student = await studentService.createStudent(schoolId, {
      firstName,
      lastName: rest.join(' ') || firstName,
      email: enquiry.email || `${data.rollNumber.toLowerCase()}@student.local`,
      password: 'Student@123',
      phone: enquiry.phone,
      gender: enquiry.gender || 'Male',
      dateOfBirth: dob as any,
      classId: data.classId,
      sectionName: data.sectionName || 'A',
      rollNumber: data.rollNumber,
      admissionNumber: enquiry.registrationNo || undefined,
    } as any);

    await db.admissionEnquiry.update({
      where: { id },
      data: { status: 'ADMITTED', admittedStudentId: student.id },
    });

    return { student, enquiryId: id };
  }

  /** Counts by funnel stage for the admission dashboard cards. */
  async getStats(schoolId: string) {
    const grouped = await db.admissionEnquiry.groupBy({
      by: ['status'],
      where: { schoolId, deletedAt: null },
      _count: true,
    });
    const byStatus: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    let total = 0;
    grouped.forEach((g: any) => {
      const n = typeof g._count === 'number' ? g._count : g._count?._all ?? 0;
      byStatus[g.status] = n;
      total += n;
    });
    return { total, ...byStatus };
  }

  private async nextRegistrationNo(schoolId: string) {
    const year = new Date().getFullYear();
    const count = await db.admissionEnquiry.count({
      where: { schoolId, registrationNo: { not: null } },
    });
    return `REG-${year}-${String(count + 1).padStart(4, '0')}`;
  }
}

export default new AdmissionService();
