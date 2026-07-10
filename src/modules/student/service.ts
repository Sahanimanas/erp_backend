import { randomUUID } from 'crypto';
import { db } from '@common/database/client';
import { hashPassword } from '@common/utils/crypto';
import templateService from '../whatsapp/templateService';
import { CreateStudentRequest, UpdateStudentRequest, UploadStudentDocumentRequest } from './types';

export class StudentService {
  /**
   * Create student
   */
  async createStudent(schoolId: string, data: CreateStudentRequest) {
    const { email, rollNumber } = data;

    // Resolve the target section. The form sends classId + sectionName (A–Z);
    // we find-or-create the section under that class. An explicit sectionId is
    // still honoured for backward compatibility / programmatic callers.
    let sectionId = data.sectionId;
    if (!sectionId) {
      if (!data.classId || !data.sectionName) {
        throw new Error('Class and section are required');
      }
      const cls = await db.class.findFirst({
        where: { id: data.classId, schoolId },
      });
      if (!cls) {
        throw new Error('Class not found');
      }
      let section = await db.section.findFirst({
        where: { classId: cls.id, name: data.sectionName },
      });
      if (!section) {
        section = await db.section.create({
          data: { schoolId, classId: cls.id, name: data.sectionName },
        });
      }
      sectionId = section.id;
    }

    // Verify the section belongs to this school
    const section = await db.section.findFirst({
      where: { id: sectionId, schoolId },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    // Check if email already exists in school — only when an email was provided.
    // Email is optional; a blank one is stored as NULL (never auto-generated).
    if (email) {
      const existingUser = await db.user.findUnique({
        where: {
          email_schoolId: {
            email,
            schoolId,
          },
        },
      });

      if (existingUser) {
        throw new Error('Email already exists');
      }
    }

    // Check if roll number already exists in section
    const existingStudent = await db.student.findFirst({
      where: {
        sectionId,
        rollNumber,
      },
    });

    if (existingStudent) {
      throw new Error('Roll number already exists in this section');
    }

    // Bulk import pre-hashes the shared default password once and passes the
    // hash through — detect the bcrypt prefix and skip re-hashing in that case.
    const looksHashed = typeof data.password === 'string' && /^\$2[aby]\$/.test(data.password);
    const hashedPassword = looksHashed ? data.password : await hashPassword(data.password);

    // Coerce date-only strings (e.g. "2012-04-01" from <input type="date">) into a
    // valid Date. Prisma rejects date-only strings for DateTime columns.
    const dob = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (!dob || isNaN(dob.getTime())) {
      throw new Error('A valid date of birth is required');
    }

    // Create the user + student atomically so a failed student insert never
    // leaves a dangling user account behind.
    const student = await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          schoolId,
          firstName: data.firstName,
          lastName: data.lastName,
          email: email || null,
          phone: data.phone,
          password: hashedPassword,
          role: 'STUDENT' as any,
        },
      });

      return tx.student.create({
        data: {
          schoolId,
          userId: user.id,
          sectionId: section.id,
          rollNumber,
          dateOfBirth: dob,
          gender: data.gender,
          bloodGroup: data.bloodGroup,
          category: data.category,
          caste: data.caste,
          religion: data.religion,
          motherTongue: data.motherTongue,
          aadharNumber: data.aadharNumber,
          penNumber: data.penNumber,
          apaarNo: data.apaarNo,
          smartCardNo: data.smartCardNo,
          height: data.height,
          weight: data.weight,
          remarks: data.remarks,
          admissionNumber: data.admissionNumber,
          registrationNo: data.registrationNo,
          feePlan: data.feePlan,
          session: data.session,
          educationHistory: Array.isArray(data.educationHistory) && data.educationHistory.length
            ? (data.educationHistory as any)
            : undefined,
          photo: data.photo,
          fatherName: data.fatherName,
          motherName: data.motherName,
          fatherAadhar: data.fatherAadhar,
          motherAadhar: data.motherAadhar,
          fatherOccupation: data.fatherOccupation,
          motherOccupation: data.motherOccupation,
          fatherQualification: data.fatherQualification,
          motherQualification: data.motherQualification,
          guardianName: data.guardianName,
          guardianPhone: data.guardianPhone,
          guardianEmail: data.guardianEmail,
          address: data.address,
          permanentAddress: data.permanentAddress,
          city: data.city,
          pincode: data.pincode,
          hostelAllotted: data.hostelAllotted ?? false,
          hostelName: data.hostelName,
          hostelRoomNo: data.hostelRoomNo,
          transportAllotted: data.transportAllotted ?? false,
          transportRoute: data.transportRoute,
          busNo: data.busNo,
          transportMonths: Array.isArray(data.transportMonths) ? data.transportMonths : undefined,
        },
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true },
          },
          section: {
            select: {
              id: true,
              name: true,
              class: { select: { id: true, name: true } },
            },
          },
        },
      });
    });

    // Auto-fire enabled STUDENT_CREATED WhatsApp templates (welcome message).
    // Fire-and-forget: messaging problems must never fail the admission.
    void (async () => {
      const school = await db.school.findUnique({ where: { id: schoolId }, select: { name: true } });
      await templateService.sendEvent(schoolId, 'STUDENT_CREATED', student.user?.phone, {
        school: school?.name ?? '',
        name: `${student.user?.firstName ?? ''} ${student.user?.lastName ?? ''}`.trim(),
        className: `${student.section?.class?.name ?? ''}-${student.section?.name ?? ''}`.replace(/^-|-$/g, ''),
        rollNumber: student.rollNumber,
        fatherName: (student as any).fatherName ?? '',
        phone: student.user?.phone ?? '',
      });
    })().catch(() => { /* logged inside sendEvent */ });

    return student;
  }

  /**
   * Update student
   */
  // Find-or-create a section under a class (mirrors the create flow) so the
  // edit form — which sends classId + sectionName (A–Z) — can move a student
  // between classes/sections without the caller knowing the section id.
  private async resolveSectionId(schoolId: string, classId: string, sectionName: string) {
    const cls = await db.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new Error('Class not found');
    let section = await db.section.findFirst({ where: { classId: cls.id, name: sectionName } });
    if (!section) {
      section = await db.section.create({ data: { schoolId, classId: cls.id, name: sectionName } });
    }
    return section.id;
  }

  async updateStudent(schoolId: string, studentId: string, data: UpdateStudentRequest) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Resolve the section: explicit sectionId wins, else classId + sectionName
    // (find-or-create), otherwise the section is left unchanged.
    let sectionId = data.sectionId;
    if (!sectionId && data.classId && data.sectionName) {
      sectionId = await this.resolveSectionId(schoolId, data.classId, data.sectionName);
    }
    if (sectionId) {
      const section = await db.section.findFirst({ where: { id: sectionId, schoolId } });
      if (!section) throw new Error('Section not found');
    }

    // Whitelist the columns that actually live on the Student row — never spread
    // the raw body (it also carries name/classId/sectionName/password/etc.).
    const STUDENT_COLS: (keyof UpdateStudentRequest)[] = [
      'rollNumber', 'gender', 'bloodGroup', 'category', 'caste', 'religion', 'motherTongue',
      'aadharNumber', 'penNumber', 'apaarNo', 'smartCardNo', 'height', 'weight', 'remarks',
      'admissionNumber', 'registrationNo', 'feePlan', 'session', 'photo',
      'fatherName', 'motherName', 'fatherAadhar', 'motherAadhar', 'fatherOccupation',
      'motherOccupation', 'fatherQualification', 'motherQualification',
      'guardianName', 'guardianPhone', 'guardianEmail',
      'address', 'permanentAddress', 'city', 'pincode',
      'hostelAllotted', 'hostelName', 'hostelRoomNo', 'transportAllotted', 'transportRoute', 'busNo',
      'transportMonths',
    ];
    const updateData: any = {};
    for (const k of STUDENT_COLS) {
      if (data[k] !== undefined) updateData[k] = data[k];
    }
    // Use the relation form, not the scalar `sectionId`: a nested user update
    // forces Prisma's *checked* update input, which only accepts `section.connect`.
    if (sectionId) updateData.section = { connect: { id: sectionId } };
    if (data.dateOfBirth) {
      const d = new Date(data.dateOfBirth);
      if (!isNaN(d.getTime())) updateData.dateOfBirth = d;
    }
    if (data.admissionDate) {
      const d = new Date(data.admissionDate);
      if (!isNaN(d.getTime())) updateData.admissionDate = d;
    }
    if (Array.isArray(data.educationHistory)) {
      updateData.educationHistory = data.educationHistory as any;
    }

    // firstName/lastName/email/phone/isActive/password live on the related User.
    const userUpdate: any = {};
    if (data.firstName !== undefined) userUpdate.firstName = data.firstName;
    if (data.lastName !== undefined) userUpdate.lastName = data.lastName;
    // Email is optional: when the field is sent blank/whitespace, clear it to
    // NULL (don't store "" — that would collide on the email+school unique index).
    if (data.email !== undefined) {
      userUpdate.email = typeof data.email === 'string' && data.email.trim() ? data.email.trim() : null;
    }
    if (data.phone !== undefined) userUpdate.phone = data.phone;
    if (data.enabled !== undefined) userUpdate.isActive = data.enabled;
    if (data.password) userUpdate.password = await hashPassword(data.password);
    if (Object.keys(userUpdate).length) updateData.user = { update: userUpdate };

    const updated = await db.student.update({
      where: { id: studentId },
      data: updateData,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        section: true,
      },
    });

    return updated;
  }

  /**
   * Get student by ID
   */
  async getStudentById(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            lastLogin: true,
          },
        },
        section: {
          include: {
            class: true,
          },
        },
        parents: {
          include: {
            user: {
              select: {
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        documents: true,
      },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    return student;
  }

  /**
   * List students
   */
  async listStudents(
    schoolId: string,
    page: number = 1,
    limit: number = 10,
    sectionId?: string,
    search?: string,
    classId?: string,
    admissionFrom?: string,
    admissionTo?: string,
    fatherName?: string,
    status?: string
  ) {
    const skip = (page - 1) * limit;
    const where: any = { schoolId, deletedAt: null };

    if (sectionId) where.sectionId = sectionId;
    // Filter by class via the section relation.
    if (classId && !sectionId) where.section = { classId };
    // Dedicated father-name filter — ANDs with the free-text search.
    if (fatherName) where.fatherName = { contains: fatherName, mode: 'insensitive' };
    // Enrollment status filter (students who left are inactive but kept in DB).
    if (status === 'active') where.isActive = true;
    else if (status === 'inactive') where.isActive = false;

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search } } },
        { rollNumber: { contains: search, mode: 'insensitive' } },
        { admissionNumber: { contains: search, mode: 'insensitive' } },
        { registrationNo: { contains: search, mode: 'insensitive' } },
        { fatherName: { contains: search, mode: 'insensitive' } },
        { motherName: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Admission-date range filter (inclusive). Date-only strings are coerced.
    if (admissionFrom || admissionTo) {
      where.admissionDate = {};
      if (admissionFrom) {
        const f = new Date(admissionFrom);
        if (!isNaN(f.getTime())) where.admissionDate.gte = f;
      }
      if (admissionTo) {
        const t = new Date(admissionTo);
        if (!isNaN(t.getTime())) { t.setHours(23, 59, 59, 999); where.admissionDate.lte = t; }
      }
    }

    const [students, total] = await Promise.all([
      db.student.findMany({
        where,
        skip,
        take: limit,
        include: {
          user: {
            select: { id: true, firstName: true, lastName: true, email: true, phone: true, isActive: true },
          },
          section: {
            select: {
              id: true,
              name: true,
              class: {
                select: { id: true, name: true, academicYear: { select: { name: true } } },
              },
            },
          },
          parents: {
            select: { relationship: true, user: { select: { firstName: true, lastName: true, phone: true } } },
          },
        },
        orderBy: { rollNumber: 'asc' },
      }),
      db.student.count({ where }),
    ]);

    return {
      data: students,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    };
  }

  /**
   * Promote students to a target class. Each promoted student is moved to a
   * section (same name if it exists in the target class, else the first section,
   * else a freshly-created section "A"). Returns counts.
   */
  async promoteStudents(
    schoolId: string,
    data: { studentIds: string[]; toClassId: string; toSectionName?: string }
  ) {
    const { studentIds, toClassId, toSectionName } = data;
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new Error('No students selected');
    }
    const toClass = await db.class.findFirst({ where: { id: toClassId, schoolId } });
    if (!toClass) throw new Error('Target class not found');

    let promoted = 0;
    const errors: string[] = [];

    for (const studentId of studentIds) {
      try {
        const student = await db.student.findFirst({ where: { id: studentId, schoolId }, include: { section: true } });
        if (!student) { errors.push(`${studentId}: not found`); continue; }

        const wantName = toSectionName || student.section?.name || 'A';
        let section =
          (await db.section.findFirst({ where: { classId: toClassId, name: wantName } })) ||
          (await db.section.findFirst({ where: { classId: toClassId } }));
        if (!section) {
          section = await db.section.create({ data: { schoolId, classId: toClassId, name: wantName } });
        }

        await db.student.update({ where: { id: studentId }, data: { sectionId: section.id } });
        promoted++;
      } catch (e: any) {
        errors.push(`${studentId}: ${e.message}`);
      }
    }
    return { promoted, failed: errors.length, errors };
  }

  /**
   * Bulk-update editable fields for many students at once (Student Bulk Update
   * grid). Student-table fields go on the student; name/phone go on the user.
   */
  async bulkUpdateStudents(
    schoolId: string,
    updates: Array<{ studentId: string } & Record<string, any>>
  ) {
    if (!Array.isArray(updates) || updates.length === 0) throw new Error('No updates provided');

    const STUDENT_FIELDS = ['rollNumber', 'gender', 'bloodGroup', 'category', 'caste', 'religion', 'motherTongue', 'aadharNumber', 'penNumber', 'apaarNo', 'smartCardNo', 'height', 'weight', 'remarks', 'admissionNumber', 'registrationNo', 'feePlan', 'educationHistory', 'photo', 'fatherName', 'motherName', 'fatherAadhar', 'motherAadhar', 'fatherOccupation', 'motherOccupation', 'fatherQualification', 'motherQualification', 'guardianName', 'guardianPhone', 'guardianEmail', 'address', 'permanentAddress', 'city', 'pincode', 'hostelAllotted', 'hostelName', 'hostelRoomNo', 'transportAllotted', 'transportRoute', 'busNo'];
    let updated = 0;
    const errors: string[] = [];

    for (const u of updates) {
      try {
        const student = await db.student.findFirst({ where: { id: u.studentId, schoolId } });
        if (!student) { errors.push(`${u.studentId}: not found`); continue; }

        const studentData: any = {};
        for (const f of STUDENT_FIELDS) if (u[f] !== undefined) studentData[f] = u[f];
        if (u.dateOfBirth) {
          const d = new Date(u.dateOfBirth);
          if (!isNaN(d.getTime())) studentData.dateOfBirth = d;
        }

        const userData: any = {};
        if (u.firstName !== undefined) userData.firstName = u.firstName;
        if (u.lastName !== undefined) userData.lastName = u.lastName;
        if (u.phone !== undefined) userData.phone = u.phone;

        await db.$transaction(async (tx) => {
          if (Object.keys(studentData).length) await tx.student.update({ where: { id: u.studentId }, data: studentData });
          if (Object.keys(userData).length) await tx.user.update({ where: { id: student.userId }, data: userData });
        });
        updated++;
      } catch (e: any) {
        errors.push(`${u.studentId}: ${e.message}`);
      }
    }
    return { updated, failed: errors.length, errors };
  }

  /**
   * Import a batch of students (Upload Student page). Each row mirrors the
   * createStudent payload; a default password is generated when none is given.
   */
  async importStudents(schoolId: string, rows: any[]) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No rows to import');

    let imported = 0;
    const errors: string[] = [];

    // Excel/CSV cells arrive as strings; turn "yes"/"true"/"1"/"y" into booleans.
    const toBool = (v: any) =>
      typeof v === 'boolean' ? v : /^(yes|true|1|y)$/i.test(String(v ?? '').trim());

    // Find-or-create a class by name so sheets that carry their own "Class"
    // column auto-create the class (no need to pick one on the page). New
    // classes attach to the school's latest academic year (created if none).
    const classCache = new Map<string, string>();
    let cachedYearId: string | null = null;
    const getYearId = async () => {
      if (cachedYearId) return cachedYearId;
      let year = await db.academicYear.findFirst({ where: { schoolId }, orderBy: { createdAt: 'desc' } });
      if (!year) {
        const y = new Date().getFullYear();
        year = await db.academicYear.create({
          data: { schoolId, name: `${y}-${y + 1}`, startDate: new Date(`${y}-04-01`), endDate: new Date(`${y + 1}-03-31`), isActive: true },
        });
      }
      cachedYearId = year.id;
      return cachedYearId;
    };
    const resolveClass = async (name?: string) => {
      const n = (name || '').trim();
      if (!n) return undefined;
      const key = n.toLowerCase();
      if (classCache.has(key)) return classCache.get(key);
      let cls = await db.class.findFirst({ where: { schoolId, name: n, deletedAt: null } });
      if (!cls) cls = await db.class.create({ data: { schoolId, name: n, academicYearId: await getYearId() } });
      classCache.set(key, cls.id);
      return cls.id;
    };

    // Find-or-create a section under a class, cached per (classId, name) so a
    // sheet of 200 students in "Class 10 / A" resolves the section ONCE.
    const sectionCache = new Map<string, string>();
    const resolveSection = async (classId: string, name?: string) => {
      const nm = (name || 'A').trim() || 'A';
      const key = `${classId}|${nm.toLowerCase()}`;
      if (sectionCache.has(key)) return sectionCache.get(key)!;
      let sec = await db.section.findFirst({ where: { classId, name: nm } });
      if (!sec) sec = await db.section.create({ data: { schoolId, classId, name: nm } });
      sectionCache.set(key, sec.id);
      return sec.id;
    };

    // Imported students share one default password — hash it ONCE (bcrypt is the
    // single most expensive per-row op) and reuse for every row that doesn't
    // carry its own. createStudent detects the bcrypt prefix and skips re-hashing.
    const defaultPasswordHash = await hashPassword('Student@123');

    // Normalise every row up front (trim, blank → undefined).
    const norm = rows.map((raw: any) => {
      const r: any = {};
      for (const k of Object.keys(raw || {})) {
        const v = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
        r[k] = v === '' ? undefined : v;
      }
      return r;
    });

    // Pre-resolve classes + sections SEQUENTIALLY (cache-backed, so only the
    // unique ones hit the DB). Doing this before the concurrent insert pass
    // avoids two rows racing to create the same new class/section.
    for (const r of norm) {
      try {
        r._classId = r.classId || (await resolveClass(r.className || r.class || r.Class));
        r._sectionId = r.sectionId || (r._classId ? await resolveSection(r._classId, r.sectionName || r.section) : undefined);
      } catch {
        /* resolution errors surface per-row in the insert pass below */
      }
    }

    // ── Bulk insert path ─────────────────────────────────────────────────
    // Build candidate user+student rows, validate uniqueness against the DB in
    // two bulk queries (not per-row), then insert with createMany. This keeps a
    // 1,000-student import to ~6 queries total instead of ~5,000.
    const dob = (v: any) => {
      const d = v ? new Date(v) : new Date('2010-01-01');
      return isNaN(d.getTime()) ? new Date('2010-01-01') : d;
    };

    type Cand = { i: number; r: any; userId: string; email: string | null; rollNumber: string };
    const cands: Cand[] = [];
    const emailSeen = new Set<string>();   // de-dupe within the file
    const rollSeen = new Set<string>();
    const aadharSeen = new Set<string>();
    const admSeen = new Set<string>();

    norm.forEach((r: any, i: number) => {
      if (!r.firstName) { errors.push(`Row ${i + 1}: firstName is required`); return; }
      if (!r._classId || !r._sectionId) { errors.push(`Row ${i + 1} (${r.firstName}): class/section could not be resolved`); return; }

      // Use ONLY the email supplied in the sheet — never fabricate one. A blank
      // email column means the student has no login email (stored as NULL), so
      // imports no longer collide on synthetic "<roll>@student.local" addresses.
      const email = r.email ? String(r.email).toLowerCase() : null;
      if (email && emailSeen.has(email)) { errors.push(`Row ${i + 1} (${r.firstName}): duplicate email in file (${email})`); return; }

      const rollNumber = String(r.rollNumber || r.registrationNo || `AUTO-${Date.now()}-${i}`);
      const rollKey = rollNumber.toLowerCase();
      if (rollSeen.has(rollKey)) { errors.push(`Row ${i + 1} (${r.firstName}): duplicate roll number in file (${rollNumber})`); return; }

      if (email) emailSeen.add(email);
      rollSeen.add(rollKey);
      cands.push({ i, r, userId: randomUUID(), email, rollNumber });
    });

    // Bulk-check what already exists in this school (two queries, not per-row).
    // Only real (non-null) emails are checked — emailless rows can't collide.
    const emails = cands.map((c) => c.email).filter((e): e is string => Boolean(e));
    const rolls = cands.map((c) => c.rollNumber);
    const [takenEmails, takenRolls] = await Promise.all([
      emails.length ? db.user.findMany({ where: { schoolId, email: { in: emails } }, select: { email: true } }) : Promise.resolve([]),
      rolls.length ? db.student.findMany({ where: { schoolId, rollNumber: { in: rolls } }, select: { rollNumber: true } }) : Promise.resolve([]),
    ]);
    const takenEmailSet = new Set(
      takenEmails.map((u) => u.email?.toLowerCase()).filter((e): e is string => Boolean(e))
    );
    const takenRollSet = new Set(takenRolls.map((s) => s.rollNumber.toLowerCase()));

    const userRows: any[] = [];
    const studentRows: any[] = [];
    for (const c of cands) {
      const { r } = c;
      if (c.email && takenEmailSet.has(c.email)) { errors.push(`Row ${c.i + 1} (${r.firstName}): email already exists (${c.email})`); continue; }
      if (takenRollSet.has(c.rollNumber.toLowerCase())) { errors.push(`Row ${c.i + 1} (${r.firstName}): roll number already exists (${c.rollNumber})`); continue; }

      // Null out blank / within-file-duplicate unique optional fields so they
      // can't trip the aadhar / admissionNumber unique constraints.
      const aadhar = r.aadharNumber && !aadharSeen.has(String(r.aadharNumber)) ? String(r.aadharNumber) : null;
      if (aadhar) aadharSeen.add(aadhar);
      const admNo = r.admissionNumber && !admSeen.has(String(r.admissionNumber)) ? String(r.admissionNumber) : null;
      if (admNo) admSeen.add(admNo);

      userRows.push({
        id: c.userId,
        schoolId,
        firstName: r.firstName,
        lastName: r.lastName || '',
        email: c.email,
        phone: r.phone || null,
        password: r.password ? r.password : defaultPasswordHash,
        role: 'STUDENT' as any,
      });
      studentRows.push({
        schoolId,
        userId: c.userId,
        sectionId: r._sectionId,
        rollNumber: c.rollNumber,
        dateOfBirth: dob(r.dateOfBirth),
        gender: r.gender || 'Male',
        bloodGroup: r.bloodGroup || null,
        category: r.category || null,
        caste: r.caste || null,
        religion: r.religion || null,
        motherTongue: r.motherTongue || null,
        aadharNumber: aadhar,
        penNumber: r.penNumber || null,
        apaarNo: r.apaarNo || null,
        smartCardNo: r.smartCardNo || null,
        height: r.height || null,
        weight: r.weight || null,
        remarks: r.remarks || null,
        admissionNumber: admNo,
        registrationNo: r.registrationNo || null,
        feePlan: r.feePlan || null,
        fatherName: r.fatherName || null,
        motherName: r.motherName || null,
        fatherAadhar: r.fatherAadhar || null,
        motherAadhar: r.motherAadhar || null,
        fatherOccupation: r.fatherOccupation || null,
        motherOccupation: r.motherOccupation || null,
        fatherQualification: r.fatherQualification || null,
        motherQualification: r.motherQualification || null,
        guardianName: r.guardianName || null,
        guardianPhone: r.guardianPhone || null,
        guardianEmail: r.guardianEmail || null,
        address: r.address || null,
        permanentAddress: r.permanentAddress || null,
        city: r.city || null,
        pincode: r.pincode || null,
        hostelAllotted: r.hostelAllotted !== undefined ? toBool(r.hostelAllotted) : false,
        hostelName: r.hostelName || null,
        hostelRoomNo: r.hostelRoomNo || null,
        transportAllotted: r.transportAllotted !== undefined ? toBool(r.transportAllotted) : false,
        transportRoute: r.transportRoute || null,
        busNo: r.busNo || null,
      });
    }

    if (userRows.length) {
      // Insert users then students. Chunk so a single statement never carries a
      // huge parameter list. skipDuplicates is a safety net for any unique
      // collision the bulk pre-checks didn't catch (e.g. aadhar already in DB).
      const CHUNK = 500;
      for (let s = 0; s < userRows.length; s += CHUNK) {
        await db.user.createMany({ data: userRows.slice(s, s + CHUNK), skipDuplicates: true });
      }
      for (let s = 0; s < studentRows.length; s += CHUNK) {
        await db.student.createMany({ data: studentRows.slice(s, s + CHUNK), skipDuplicates: true });
      }

      // Reconcile: a student row skipped by a late unique collision would leave
      // its user orphaned — delete any of this batch's users that got no student.
      const createdUserIds = userRows.map((u) => u.id);
      const placed = await db.student.findMany({ where: { userId: { in: createdUserIds } }, select: { userId: true } });
      const placedSet = new Set(placed.map((p) => p.userId));
      imported = placedSet.size;
      const orphans = createdUserIds.filter((id) => !placedSet.has(id));
      if (orphans.length) {
        await db.user.deleteMany({ where: { id: { in: orphans } } });
        errors.push(`${orphans.length} row(s) skipped due to a duplicate aadhar / admission number already in the system`);
      }
    }

    return { imported, failed: errors.length, errors };
  }

  /**
   * Deactivate student
   */
  /**
   * Mark a student INACTIVE (left the school) without deleting them. The record
   * and its fee history are retained so the admin keeps a full picture of what
   * the student was billed. `billedUntilMonth` ("Jun-2025") caps recurring
   * (Monthly/Quarterly) fee accrual to that month — see PaymentsService's ledger
   * capping. Defaults to the current calendar month when omitted. Also disables
   * the student's login. Session / One-time fees stay fully due for later waiver.
   */
  async deactivateStudent(
    schoolId: string,
    studentId: string,
    opts: { billedUntilMonth?: string; leftDate?: string } = {}
  ) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const now = new Date();
    const billedUntilMonth = opts.billedUntilMonth || `${MONTHS[now.getMonth()]}-${now.getFullYear()}`;
    const leftDate = opts.leftDate ? new Date(opts.leftDate) : now;

    await db.$transaction([
      db.student.update({
        where: { id: student.id },
        data: { isActive: false, leftDate, billedUntilMonth },
      }),
      db.user.update({
        where: { id: student.userId },
        data: { isActive: false },
      }),
    ]);

    return { message: 'Student marked inactive', billedUntilMonth, leftDate };
  }

  /**
   * Re-activate a student (re-admission / undo). Clears the leaving metadata so
   * recurring fees resume accruing normally, and re-enables login.
   */
  async activateStudent(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    await db.$transaction([
      db.student.update({
        where: { id: student.id },
        data: { isActive: true, leftDate: null, billedUntilMonth: null },
      }),
      db.user.update({
        where: { id: student.userId },
        data: { isActive: true },
      }),
    ]);

    return { message: 'Student activated' };
  }

  /**
   * Upload student document
   */
  async uploadDocument(schoolId: string, studentId: string, data: UploadStudentDocumentRequest) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const document = await db.studentDocument.create({
      data: {
        schoolId,
        studentId,
        type: data.type,
        fileUrl: data.fileUrl,
      },
    });

    return document;
  }

  /**
   * Get student documents
   */
  async getStudentDocuments(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const documents = await db.studentDocument.findMany({
      where: { studentId },
    });

    return documents;
  }

  /**
   * Delete student document
   */
  async deleteDocument(schoolId: string, documentId: string) {
    const document = await db.studentDocument.findUnique({
      where: { id: documentId },
    });

    if (!document || document.schoolId !== schoolId) {
      throw new Error('Document not found');
    }

    await db.studentDocument.delete({
      where: { id: documentId },
    });

    return { message: 'Document deleted' };
  }

  /**
   * Get student fee dues
   */
  async getStudentDues(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const fees = await db.feeCollection.findMany({
      where: {
        schoolId,
        studentId,
        status: { in: ['PENDING', 'FAILED'] },
      },
      include: {
        fee: {
          select: {
            id: true,
            dueDate: true,
            fine: true,
            group: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    return fees;
  }

  /**
   * Get student attendance percentage
   */
  async getAttendancePercentage(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const totalDays = await db.studentAttendance.count({
      where: { studentId },
    });

    const presentDays = await db.studentAttendance.count({
      where: {
        studentId,
        status: 'PRESENT',
      },
    });

    const percentage = totalDays === 0 ? 0 : Math.round((presentDays / totalDays) * 100);

    return {
      totalDays,
      presentDays,
      percentage,
    };
  }

  /**
   * Delete student
   */
  async deleteStudent(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // Delete related documents first
    await db.studentDocument.deleteMany({
      where: { studentId },
    });

    // Delete student
    await db.student.delete({
      where: { id: studentId },
    });

    // Delete associated user
    await db.user.delete({
      where: { id: student.userId },
    });

    return { message: 'Student deleted' };
  }
}

export default new StudentService();
