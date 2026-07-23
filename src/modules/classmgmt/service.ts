import { db } from '@common/database/client';

/**
 * Class Management module — Sessions, Classes, Class Details, Subjects,
 * Non-Subjects, Syllabus and Employee↔Subject mapping. Sessions/Classes/Subjects
 * write to the SAME core tables (AcademicYear/Class/Subject) the rest of the app
 * uses, so students, fees, exams and the timetable stay in sync.
 */
const toDate = (v: any) => (v ? new Date(v) : undefined);

export class ClassMgmtService {
  // ── SESSIONS (AcademicYear) ───────────────────────────────────────────────
  async listSessions(schoolId: string) {
    return db.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { classes: true } } },
    });
  }

  async saveSession(schoolId: string, data: any) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Session name is required');

    // Only one active session per school.
    if (data.isActive) {
      await db.academicYear.updateMany({ where: { schoolId }, data: { isActive: false } });
    }

    const payload = {
      name,
      sessionCode: data.sessionCode || null,
      timetableSession: data.timetableSession || null,
      description: data.description || null,
      startDate: toDate(data.startDate),
      endDate: toDate(data.endDate),
      isActive: !!data.isActive,
      enabled: data.enabled !== false,
    };

    if (data.id) {
      const existing = await db.academicYear.findFirst({ where: { id: data.id, schoolId } });
      if (!existing) throw new Error('Session not found');
      return db.academicYear.update({ where: { id: data.id }, data: payload });
    }

    const dup = await db.academicYear.findFirst({ where: { schoolId, name } });
    if (dup) throw new Error('A session with this name already exists');
    return db.academicYear.create({
      data: {
        schoolId,
        ...payload,
        startDate: payload.startDate ?? new Date(),
        endDate: payload.endDate ?? new Date(),
      },
    });
  }

  async setActiveSession(schoolId: string, id: string) {
    const year = await db.academicYear.findFirst({ where: { id, schoolId } });
    if (!year) throw new Error('Session not found');
    await db.academicYear.updateMany({ where: { schoolId }, data: { isActive: false } });
    return db.academicYear.update({ where: { id }, data: { isActive: true } });
  }

  async deleteSession(schoolId: string, id: string) {
    const year = await db.academicYear.findFirst({
      where: { id, schoolId },
      include: { _count: { select: { classes: true } } },
    });
    if (!year) throw new Error('Session not found');
    if (year._count.classes > 0) throw new Error('Cannot delete a session that still has classes');
    await db.academicYear.delete({ where: { id } });
    return { message: 'Session deleted' };
  }

  // ── CLASSES ───────────────────────────────────────────────────────────────
  async listClasses(schoolId: string, academicYearId?: string) {
    const classes = await db.class.findMany({
      where: { schoolId, deletedAt: null, ...(academicYearId ? { academicYearId } : {}) },
      include: {
        academicYear: { select: { id: true, name: true } },
        sections: { where: { deletedAt: null }, select: { id: true, name: true } },
      },
      orderBy: [{ classSequence: 'asc' }, { name: 'asc' }],
    });
    return classes.map((c) => ({ ...c, sectionNames: c.sections.map((s) => s.name) }));
  }

  async saveClass(schoolId: string, data: any) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Class name is required');

    const fields = {
      description: data.description || null,
      classCode: data.classCode || null,
      classType: data.classType || null,
      classSequence: data.classSequence != null && data.classSequence !== '' ? Number(data.classSequence) : null,
      noOfSessions: Number(data.noOfSessions) || 1,
      departmentId: data.departmentId || null,
      enabled: data.enabled !== false,
      ...(data.academicYearId ? { academicYearId: data.academicYearId } : {}),
    };

    let cls;
    if (data.id) {
      const existing = await db.class.findFirst({ where: { id: data.id, schoolId } });
      if (!existing) throw new Error('Class not found');
      cls = await db.class.update({ where: { id: data.id }, data: { name, ...fields } });
    } else {
      const dup = await db.class.findFirst({ where: { schoolId, name } });
      if (dup) {
        if (dup.deletedAt) {
          cls = await db.class.update({ where: { id: dup.id }, data: { deletedAt: null, name, ...fields } });
        } else {
          throw new Error('Class with this name already exists');
        }
      } else {
        // academicYearId is required on Class — default handled by caller passing it.
        const academicYearId = data.academicYearId || (await this.defaultYearId(schoolId));
        if (!academicYearId) throw new Error('Create a session first');
        cls = await db.class.create({ data: { schoolId, name, ...fields, academicYearId } });
      }
    }

    // Sync sections from the multi-select "Class Section" (find-or-create).
    if (Array.isArray(data.sections)) {
      for (const raw of data.sections) {
        const sname = String(raw || '').trim();
        if (!sname) continue;
        const existingSec = await db.section.findFirst({ where: { classId: cls.id, name: sname } });
        if (existingSec) {
          if (existingSec.deletedAt) await db.section.update({ where: { id: existingSec.id }, data: { deletedAt: null } });
        } else {
          await db.section.create({ data: { schoolId, classId: cls.id, name: sname } });
        }
      }
    }
    return cls;
  }

  private async defaultYearId(schoolId: string) {
    const active = await db.academicYear.findFirst({ where: { schoolId, isActive: true }, select: { id: true } });
    if (active) return active.id;
    const latest = await db.academicYear.findFirst({ where: { schoolId }, orderBy: { startDate: 'desc' }, select: { id: true } });
    return latest?.id ?? null;
  }

  async deleteClass(schoolId: string, id: string) {
    const cls = await db.class.findFirst({ where: { id, schoolId } });
    if (!cls) throw new Error('Class not found');
    await db.class.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Class deleted' };
  }

  // ── CLASS DETAILS (per year) ───────────────────────────────────────────────
  async getClassDetails(schoolId: string, classId: string) {
    const cls = await db.class.findFirst({
      where: { id: classId, schoolId },
      select: { id: true, name: true, classCode: true, noOfSessions: true },
    });
    if (!cls) throw new Error('Class not found');
    const details = await db.classDetail.findMany({ where: { schoolId, classId }, orderBy: { yearIndex: 'asc' } });
    return { class: cls, details };
  }

  async saveClassDetails(schoolId: string, classId: string, details: any[]) {
    const cls = await db.class.findFirst({ where: { id: classId, schoolId } });
    if (!cls) throw new Error('Class not found');
    let saved = 0;
    for (const d of details || []) {
      const yearIndex = Number(d.yearIndex);
      if (!yearIndex) continue;
      const data = {
        name: d.name || null,
        classCode: d.classCode || null,
        maxInternalExam: d.maxInternalExam != null && d.maxInternalExam !== '' ? Number(d.maxInternalExam) : null,
        bestInternalExamCount: d.bestInternalExamCount != null && d.bestInternalExamCount !== '' ? Number(d.bestInternalExamCount) : null,
        noOfElectiveSubject: d.noOfElectiveSubject != null && d.noOfElectiveSubject !== '' ? Number(d.noOfElectiveSubject) : null,
        enabled: d.enabled !== false,
      };
      await db.classDetail.upsert({
        where: { classId_yearIndex: { classId, yearIndex } },
        update: data,
        create: { schoolId, classId, yearIndex, ...data },
      });
      saved++;
    }
    return { saved };
  }

  // ── SUBJECTS (Subject + ClassSubject mapping) ──────────────────────────────
  async listClassSubjects(schoolId: string, classId: string) {
    const rows = await db.classSubject.findMany({
      where: { classId, subject: { deletedAt: null } },
      include: { subject: true },
    });
    return rows
      .map((r) => ({
        id: r.subject.id,
        classSubjectId: r.id,
        name: r.subject.name,
        code: r.subject.code,
        displayOrder: r.subject.displayOrder,
        totalMarks: r.subject.totalMarks,
        passingMarks: r.subject.passingMarks,
        enabled: r.subject.enabled,
        createdAt: r.subject.createdAt,
      }))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  }

  async saveClassSubject(schoolId: string, data: any) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Subject name is required');
    const code = String(data.code || '').trim() || name.slice(0, 8).toUpperCase() + '-' + Math.floor(Math.random() * 900 + 100);

    const fields = {
      name,
      displayOrder: Number(data.displayOrder) || 0,
      totalMarks: Number(data.totalMarks) || 100,
      passingMarks: Number(data.passingMarks) || 0,
      enabled: data.enabled !== false,
    };

    let subject;
    if (data.id) {
      subject = await db.subject.update({ where: { id: data.id }, data: { ...fields, code } });
    } else {
      // Reuse an existing subject with the same code, else create.
      const existing = await db.subject.findFirst({ where: { schoolId, code } });
      subject = existing
        ? await db.subject.update({ where: { id: existing.id }, data: { ...fields, deletedAt: null } })
        : await db.subject.create({ data: { schoolId, code, description: null, ...fields } });
    }

    // Map to the class if a class was given and it isn't already mapped.
    if (data.classId) {
      const mapped = await db.classSubject.findUnique({
        where: { classId_subjectId: { classId: data.classId, subjectId: subject.id } },
      });
      if (!mapped) await db.classSubject.create({ data: { classId: data.classId, subjectId: subject.id } });
    }
    return subject;
  }

  // ── NON-SUBJECTS ───────────────────────────────────────────────────────────
  async listNonSubjects(schoolId: string, classId?: string) {
    return db.nonSubject.findMany({
      where: { schoolId, ...(classId ? { classId } : {}) },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async saveNonSubject(schoolId: string, data: any) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Name is required');
    const fields = {
      classId: data.classId || null,
      name,
      totalMarks: Number(data.totalMarks) || 100,
      displayOrder: Number(data.displayOrder) || 0,
      enabled: data.enabled !== false,
    };
    if (data.id) {
      const existing = await db.nonSubject.findFirst({ where: { id: data.id, schoolId } });
      if (!existing) throw new Error('Non-subject not found');
      return db.nonSubject.update({ where: { id: data.id }, data: fields });
    }
    return db.nonSubject.create({ data: { schoolId, ...fields } });
  }

  // ── SYLLABUS ────────────────────────────────────────────────────────────────
  async listSyllabus(schoolId: string) {
    const [rows, classes, years] = await Promise.all([
      db.syllabus.findMany({ where: { schoolId }, orderBy: { createdAt: 'desc' } }),
      db.class.findMany({ where: { schoolId }, select: { id: true, name: true } }),
      db.academicYear.findMany({ where: { schoolId }, select: { id: true, name: true } }),
    ]);
    const clsById = new Map(classes.map((c) => [c.id, c.name]));
    const yrById = new Map(years.map((y) => [y.id, y.name]));
    return rows.map((r) => ({
      ...r,
      className: clsById.get(r.classId) || '',
      sessionName: r.academicYearId ? yrById.get(r.academicYearId) || '' : '',
    }));
  }

  async getSyllabus(schoolId: string, id: string) {
    const row = await db.syllabus.findFirst({ where: { id, schoolId } });
    if (!row) throw new Error('Syllabus not found');
    return row;
  }

  async saveSyllabus(schoolId: string, data: any) {
    const title = String(data.title || '').trim();
    if (!title) throw new Error('Title is required');
    if (!data.classId) throw new Error('Class is required');
    const fields = {
      academicYearId: data.academicYearId || null,
      classId: data.classId,
      sectionId: data.sectionId || null,
      title,
      content: data.content || '',
      attachments: data.attachments ?? undefined,
      enabled: data.enabled !== false,
    };
    if (data.id) {
      const existing = await db.syllabus.findFirst({ where: { id: data.id, schoolId } });
      if (!existing) throw new Error('Syllabus not found');
      return db.syllabus.update({ where: { id: data.id }, data: fields });
    }
    return db.syllabus.create({ data: { schoolId, ...fields } });
  }

  async deleteSyllabus(schoolId: string, id: string) {
    const row = await db.syllabus.findFirst({ where: { id, schoolId } });
    if (!row) throw new Error('Syllabus not found');
    await db.syllabus.delete({ where: { id } });
    return { message: 'Syllabus deleted' };
  }

  // ── EMPLOYEE ↔ SUBJECT MAPPING ─────────────────────────────────────────────
  async getEmployeeMapping(schoolId: string, employeeId: string, classId: string) {
    const [subjects, nonSubjects, maps] = await Promise.all([
      this.listClassSubjects(schoolId, classId),
      this.listNonSubjects(schoolId, classId),
      db.employeeSubjectMap.findMany({ where: { schoolId, employeeId, classId } }),
    ]);
    const subjSet = new Set(maps.map((m) => m.subjectId).filter(Boolean) as string[]);
    const nonSet = new Set(maps.map((m) => m.nonSubjectId).filter(Boolean) as string[]);
    return {
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, checked: subjSet.has(s.id) })),
      nonSubjects: nonSubjects.map((n) => ({ id: n.id, name: n.name, checked: nonSet.has(n.id) })),
    };
  }

  async saveEmployeeMapping(schoolId: string, data: any) {
    const { employeeId, classId } = data;
    if (!employeeId || !classId) throw new Error('employeeId and classId required');
    const subjectIds: string[] = Array.isArray(data.subjectIds) ? data.subjectIds : [];
    const nonSubjectIds: string[] = Array.isArray(data.nonSubjectIds) ? data.nonSubjectIds : [];

    await db.$transaction(async (tx) => {
      await tx.employeeSubjectMap.deleteMany({ where: { schoolId, employeeId, classId } });
      const rows = [
        ...subjectIds.map((subjectId) => ({ schoolId, employeeId, classId, academicYearId: data.academicYearId || null, subjectId, nonSubjectId: null })),
        ...nonSubjectIds.map((nonSubjectId) => ({ schoolId, employeeId, classId, academicYearId: data.academicYearId || null, subjectId: null, nonSubjectId })),
      ];
      if (rows.length) await tx.employeeSubjectMap.createMany({ data: rows });
    });
    return { message: 'Mapping saved', subjects: subjectIds.length, nonSubjects: nonSubjectIds.length };
  }
}

export default new ClassMgmtService();
