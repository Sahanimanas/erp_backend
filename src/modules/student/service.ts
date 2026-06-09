import { db } from '@common/database/client';
import { hashPassword } from '@common/utils/crypto';
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

    // Check if email already exists in school
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

    const hashedPassword = await hashPassword(data.password);

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
          email,
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

    return student;
  }

  /**
   * Update student
   */
  async updateStudent(schoolId: string, studentId: string, data: UpdateStudentRequest) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    // If changing section, verify new section exists
    if (data.sectionId) {
      const section = await db.section.findFirst({
        where: { id: data.sectionId, schoolId },
      });

      if (!section) {
        throw new Error('Section not found');
      }
    }

    const updateData: any = { ...data };
    // firstName/lastName/email/phone live on the related User, not Student —
    // route them to a nested user update and strip them off the student payload.
    if (data.firstName || data.lastName || data.email || data.phone) {
      updateData.user = {
        update: {
          ...(data.firstName !== undefined && { firstName: data.firstName }),
          ...(data.lastName !== undefined && { lastName: data.lastName }),
          ...(data.email !== undefined && { email: data.email }),
          ...(data.phone !== undefined && { phone: data.phone }),
        },
      };
    }
    delete updateData.firstName;
    delete updateData.lastName;
    delete updateData.email;
    delete updateData.phone;

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
    admissionTo?: string
  ) {
    const skip = (page - 1) * limit;
    const where: any = { schoolId, deletedAt: null };

    if (sectionId) where.sectionId = sectionId;
    // Filter by class via the section relation.
    if (classId && !sectionId) where.section = { classId };

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search } } },
        { rollNumber: { contains: search, mode: 'insensitive' } },
        { admissionNumber: { contains: search, mode: 'insensitive' } },
        { registrationNo: { contains: search, mode: 'insensitive' } },
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

    for (let i = 0; i < rows.length; i++) {
      // Normalise: trim strings and turn blank cells into undefined so optional
      // unique columns (aadharNumber, admissionNumber…) don't collide on "".
      const raw = rows[i] || {};
      const r: any = {};
      for (const k of Object.keys(raw)) {
        const v = typeof raw[k] === 'string' ? raw[k].trim() : raw[k];
        r[k] = v === '' ? undefined : v;
      }
      try {
        await this.createStudent(schoolId, {
          firstName: r.firstName,
          lastName: r.lastName || '',
          email: r.email || `${(r.rollNumber || `stu${Date.now()}${i}`).toString().toLowerCase()}@student.local`,
          password: r.password || 'Student@123',
          phone: r.phone,
          dateOfBirth: r.dateOfBirth,
          gender: r.gender || 'Male',
          classId: r.classId,
          sectionName: r.sectionName || r.section || 'A',
          sectionId: r.sectionId,
          rollNumber: r.rollNumber,
          admissionNumber: r.admissionNumber,
          registrationNo: r.registrationNo,
          feePlan: r.feePlan,
          bloodGroup: r.bloodGroup,
          category: r.category,
          caste: r.caste,
          religion: r.religion,
          motherTongue: r.motherTongue,
          aadharNumber: r.aadharNumber,
          penNumber: r.penNumber,
          apaarNo: r.apaarNo,
          smartCardNo: r.smartCardNo,
          height: r.height,
          weight: r.weight,
          remarks: r.remarks,
          fatherName: r.fatherName,
          motherName: r.motherName,
          fatherAadhar: r.fatherAadhar,
          motherAadhar: r.motherAadhar,
          fatherOccupation: r.fatherOccupation,
          motherOccupation: r.motherOccupation,
          fatherQualification: r.fatherQualification,
          motherQualification: r.motherQualification,
          guardianName: r.guardianName,
          guardianPhone: r.guardianPhone,
          guardianEmail: r.guardianEmail,
          address: r.address,
          permanentAddress: r.permanentAddress,
          city: r.city,
          pincode: r.pincode,
          hostelAllotted: r.hostelAllotted !== undefined ? toBool(r.hostelAllotted) : undefined,
          hostelName: r.hostelName,
          hostelRoomNo: r.hostelRoomNo,
          transportAllotted: r.transportAllotted !== undefined ? toBool(r.transportAllotted) : undefined,
          transportRoute: r.transportRoute,
          busNo: r.busNo,
        } as any);
        imported++;
      } catch (e: any) {
        errors.push(`Row ${i + 1} (${r.firstName || '?'}): ${e.message}`);
      }
    }
    return { imported, failed: errors.length, errors };
  }

  /**
   * Deactivate student
   */
  async deactivateStudent(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    await db.user.update({
      where: { id: student.userId },
      data: { isActive: false },
    });

    return { message: 'Student deactivated' };
  }

  /**
   * Activate student
   */
  async activateStudent(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    await db.user.update({
      where: { id: student.userId },
      data: { isActive: true },
    });

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
