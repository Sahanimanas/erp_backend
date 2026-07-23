import { db } from '@common/database/client';

/**
 * Result Management — builds directly on Exam Management. Exam subject results
 * read/write the SHARED `StudentMark` table (same as exams.enterStudentMarks)
 * and auto-sync `ExamSubject`, so marks entered here appear in Exam Management
 * and vice-versa. Non-subject results, report-card remarks, generated report
 * cards and publish-state use their own tables.
 */
export class ResultMgmtService {
  // ── shared helpers ─────────────────────────────────────────────────────────
  private async section(schoolId: string, sectionId: string) {
    const sec = await db.section.findFirst({
      where: { id: sectionId, schoolId },
      select: { id: true, name: true, classId: true, class: { select: { id: true, name: true } } },
    });
    if (!sec) throw new Error('Section not found');
    return sec;
  }

  private async students(schoolId: string, sectionId: string, sortBy = 'Name') {
    const rows = await db.student.findMany({
      where: { schoolId, sectionId, deletedAt: null },
      select: {
        id: true, rollNumber: true, registrationNo: true, fatherName: true,
        user: { select: { firstName: true, lastName: true } },
      },
    });
    const list = rows.map((s) => ({
      id: s.id,
      name: `${s.user.firstName} ${s.user.lastName}`.trim(),
      rollNumber: s.rollNumber || '',
      registrationNo: s.registrationNo || 'N/A',
      fatherName: s.fatherName || '',
    }));
    if (sortBy === 'RollNo') list.sort((a, b) => (a.rollNumber || '').localeCompare(b.rollNumber || '', undefined, { numeric: true }));
    else list.sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }

  /** total marks for a class+subject in an exam: schedule.maxMarks → examSubject → subject.totalMarks → 100 */
  private async totalForSubject(examId: string, classId: string, subjectId: string) {
    const sched = await db.examSchedule.findFirst({ where: { examId, classId, subjectId }, select: { maxMarks: true, minMarks: true } });
    if (sched) return { total: sched.maxMarks, pass: sched.minMarks };
    const es = await db.examSubject.findUnique({ where: { examId_subjectId: { examId, subjectId } }, select: { totalMarks: true, passingMarks: true } });
    if (es) return { total: es.totalMarks, pass: es.passingMarks };
    const subj = await db.subject.findUnique({ where: { id: subjectId }, select: { totalMarks: true, passingMarks: true } });
    return { total: subj?.totalMarks ?? 100, pass: subj?.passingMarks ?? 33 };
  }

  private async gradeFor(schoolId: string, percentage: number) {
    const band = await db.gradingScale.findFirst({
      where: { schoolId, minPercent: { lte: percentage }, maxPercent: { gte: percentage } },
    });
    return band?.grade ?? '';
  }

  /** Ensure the subject is attached to the exam (keeps Exam Management in sync). */
  private async ensureExamSubject(examId: string, classId: string, subjectId: string) {
    const existing = await db.examSubject.findUnique({ where: { examId_subjectId: { examId, subjectId } } });
    if (existing) return existing;
    const { total, pass } = await this.totalForSubject(examId, classId, subjectId);
    return db.examSubject.create({ data: { examId, subjectId, totalMarks: total, passingMarks: pass } });
  }

  private async classSubjects(classId: string) {
    const rows = await db.classSubject.findMany({
      where: { classId, subject: { deletedAt: null } },
      include: { subject: { select: { id: true, name: true, displayOrder: true, totalMarks: true } } },
    });
    return rows
      .map((r) => r.subject)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  }

  // ── EXAM RESULT (single subject) ───────────────────────────────────────────
  async getExamResult(schoolId: string, examId: string, sectionId: string, subjectId: string, sortBy = 'Name') {
    const sec = await this.section(schoolId, sectionId);
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId }, select: { id: true, name: true } });
    if (!exam) throw new Error('Exam not found');
    const subject = await db.subject.findFirst({ where: { id: subjectId, schoolId }, select: { id: true, name: true } });
    if (!subject) throw new Error('Subject not found');

    const { total } = await this.totalForSubject(examId, sec.classId, subjectId);
    const students = await this.students(schoolId, sectionId, sortBy);
    const marks = await db.studentMark.findMany({
      where: { schoolId, examId, subjectId, studentId: { in: students.map((s) => s.id) } },
    });
    const byStudent = new Map(marks.map((m) => [m.studentId, m.marks]));
    return {
      exam, subject, totalMarks: total,
      students: students.map((s) => ({ ...s, scored: byStudent.has(s.id) ? byStudent.get(s.id) : null })),
    };
  }

  async saveExamResult(schoolId: string, data: any) {
    const { examId, sectionId, subjectId } = data;
    const sec = await this.section(schoolId, sectionId);
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId } });
    if (!exam) throw new Error('Exam not found');
    await this.ensureExamSubject(examId, sec.classId, subjectId);

    let saved = 0;
    for (const row of data.marks || []) {
      const scored = row.scored;
      const blank = scored === null || scored === undefined || scored === '';
      if (blank) {
        await db.studentMark.deleteMany({ where: { schoolId, examId, subjectId, studentId: row.studentId } });
      } else {
        const value = Math.max(0, Math.round(Number(scored)));
        const existing = await db.studentMark.findFirst({ where: { schoolId, examId, subjectId, studentId: row.studentId } });
        if (existing) await db.studentMark.update({ where: { id: existing.id }, data: { marks: value } });
        else await db.studentMark.create({ data: { schoolId, examId, subjectId, studentId: row.studentId, marks: value } });
      }
      saved++;
    }
    return { message: 'Student exam results are updated', saved };
  }

  // ── ALL EXAM RESULT (every class subject) ──────────────────────────────────
  async getAllExamResult(schoolId: string, examId: string, sectionId: string, sortBy = 'Name') {
    const sec = await this.section(schoolId, sectionId);
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId }, select: { id: true, name: true } });
    if (!exam) throw new Error('Exam not found');

    const subjects = await this.classSubjects(sec.classId);
    const cols = await Promise.all(subjects.map(async (s) => ({ id: s.id, name: s.name, totalMarks: (await this.totalForSubject(examId, sec.classId, s.id)).total })));
    const students = await this.students(schoolId, sectionId, sortBy);
    const marks = await db.studentMark.findMany({ where: { schoolId, examId, studentId: { in: students.map((s) => s.id) } } });
    const byKey = new Map(marks.map((m) => [`${m.studentId}|${m.subjectId}`, m.marks]));
    return {
      exam, subjects: cols,
      students: students.map((s) => ({
        ...s,
        marks: Object.fromEntries(cols.map((c) => [c.id, byKey.has(`${s.id}|${c.id}`) ? byKey.get(`${s.id}|${c.id}`) : null])),
      })),
    };
  }

  async saveAllExamResult(schoolId: string, data: any) {
    const { examId, sectionId } = data;
    const sec = await this.section(schoolId, sectionId);
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId } });
    if (!exam) throw new Error('Exam not found');

    const touchedSubjects = new Set<string>();
    (data.rows || []).forEach((r: any) => Object.keys(r.marks || {}).forEach((sid) => touchedSubjects.add(sid)));
    for (const sid of touchedSubjects) await this.ensureExamSubject(examId, sec.classId, sid);

    let saved = 0;
    for (const row of data.rows || []) {
      for (const [subjectId, scored] of Object.entries(row.marks || {})) {
        const blank = scored === null || scored === undefined || scored === '';
        if (blank) {
          await db.studentMark.deleteMany({ where: { schoolId, examId, subjectId, studentId: row.studentId } });
        } else {
          const value = Math.max(0, Math.round(Number(scored)));
          const existing = await db.studentMark.findFirst({ where: { schoolId, examId, subjectId, studentId: row.studentId } });
          if (existing) await db.studentMark.update({ where: { id: existing.id }, data: { marks: value } });
          else await db.studentMark.create({ data: { schoolId, examId, subjectId, studentId: row.studentId, marks: value } });
        }
      }
      saved++;
    }
    return { message: 'Student exam results are updated', saved };
  }

  // ── NON-SUBJECT RESULT (per term) ──────────────────────────────────────────
  async getNonSubjectResult(schoolId: string, sectionId: string, term: string, sortBy = 'Name') {
    const sec = await this.section(schoolId, sectionId);
    const nonSubjects = await db.nonSubject.findMany({
      where: { schoolId, OR: [{ classId: sec.classId }, { classId: null }], enabled: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, totalMarks: true },
    });
    const students = await this.students(schoolId, sectionId, sortBy);
    const marks = await db.nonSubjectMark.findMany({ where: { schoolId, term, studentId: { in: students.map((s) => s.id) } } });
    const byKey = new Map(marks.map((m) => [`${m.studentId}|${m.nonSubjectId}`, m.marks]));
    return {
      term, nonSubjects,
      students: students.map((s) => ({
        ...s,
        marks: Object.fromEntries(nonSubjects.map((n) => [n.id, byKey.has(`${s.id}|${n.id}`) ? byKey.get(`${s.id}|${n.id}`) : null])),
      })),
    };
  }

  async saveNonSubjectResult(schoolId: string, data: any) {
    const { term } = data;
    if (!term) throw new Error('Term is required');
    let saved = 0;
    for (const row of data.rows || []) {
      for (const [nonSubjectId, marks] of Object.entries(row.marks || {})) {
        const blank = marks === null || marks === undefined || marks === '';
        if (blank) {
          await db.nonSubjectMark.deleteMany({ where: { schoolId, term, nonSubjectId, studentId: row.studentId } });
        } else {
          await db.nonSubjectMark.upsert({
            where: { studentId_nonSubjectId_term: { studentId: row.studentId, nonSubjectId, term } },
            update: { marks: Math.round(Number(marks)) },
            create: { schoolId, studentId: row.studentId, nonSubjectId, term, marks: Math.round(Number(marks)) },
          });
        }
      }
      saved++;
    }
    return { message: 'Non-subject results updated', saved };
  }

  // ── REPORT CARD REMARKS ────────────────────────────────────────────────────
  async getRemarks(schoolId: string, sectionId: string, academicYearId: string | null, term = '', sortBy = 'Name') {
    const students = await this.students(schoolId, sectionId, sortBy);
    const rows = await db.reportCardRemark.findMany({ where: { schoolId, academicYearId, term, studentId: { in: students.map((s) => s.id) } } });
    const byStudent = new Map(rows.map((r) => [r.studentId, r.remark]));
    return { students: students.map((s) => ({ ...s, remark: byStudent.get(s.id) || '' })) };
  }

  async saveRemarks(schoolId: string, data: any) {
    const academicYearId = data.academicYearId || null;
    const term = data.term || '';
    let saved = 0;
    for (const row of data.remarks || []) {
      await db.reportCardRemark.upsert({
        where: { studentId_academicYearId_term: { studentId: row.studentId, academicYearId, term } },
        update: { remark: row.remark || '' },
        create: { schoolId, studentId: row.studentId, academicYearId, term, remark: row.remark || '' },
      });
      saved++;
    }
    return { message: 'Report card remarks updated', saved };
  }

  // ── PUBLISH EXAM RESULT ────────────────────────────────────────────────────
  async getExamPublishStatus(schoolId: string, examId: string, sectionId: string, sortBy = 'Name') {
    const sec = await this.section(schoolId, sectionId);
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId }, select: { id: true, name: true } });
    if (!exam) throw new Error('Exam not found');
    const subjects = await this.classSubjects(sec.classId);
    const cols = await Promise.all(subjects.map(async (s) => ({ id: s.id, name: s.name, total: (await this.totalForSubject(examId, sec.classId, s.id)).total })));
    const students = await this.students(schoolId, sectionId, sortBy);
    const marks = await db.studentMark.findMany({ where: { schoolId, examId, studentId: { in: students.map((s) => s.id) } } });
    const byKey = new Map(marks.map((m) => [`${m.studentId}|${m.subjectId}`, m.marks]));

    const rows = await Promise.all(students.map(async (s) => {
      let obtained = 0; let total = 0;
      cols.forEach((c) => { total += c.total; const v = byKey.get(`${s.id}|${c.id}`); if (typeof v === 'number') obtained += v; });
      const pct = total ? Math.round((obtained / total) * 100) : 0;
      return { ...s, obtained, total, percentage: pct, grade: await this.gradeFor(schoolId, pct) };
    }));

    const pub = await db.examResultPublish.findUnique({ where: { examId_sectionId: { examId, sectionId } } });
    return { exam, section: { id: sec.id, name: sec.name, className: sec.class.name }, published: pub?.published ?? false, subjects: cols, students: rows };
  }

  async publishExamResult(schoolId: string, data: any) {
    const { examId, sectionId, published = true } = data;
    await this.section(schoolId, sectionId);
    const pub = await db.examResultPublish.upsert({
      where: { examId_sectionId: { examId, sectionId } },
      update: { published, publishedAt: new Date() },
      create: { schoolId, examId, sectionId, published },
    });
    return { message: published ? 'Exam result published' : 'Exam result unpublished', published: pub.published };
  }

  // ── REPORT CARDS (generate / view / publish) ───────────────────────────────
  async generateReportCards(schoolId: string, data: any) {
    const { sectionId, examId } = data;
    const academicYearId = data.academicYearId || null;
    const sec = await this.section(schoolId, sectionId);
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId }, select: { id: true, name: true } });
    if (!exam) throw new Error('Select an exam / term');
    const term = data.term || exam.name;

    const subjects = await this.classSubjects(sec.classId);
    const cols = await Promise.all(subjects.map(async (s) => ({ id: s.id, name: s.name, total: (await this.totalForSubject(examId, sec.classId, s.id)).total })));
    let students = await this.students(schoolId, sectionId, 'Name');
    if (data.studentId) students = students.filter((s) => s.id === data.studentId);

    const ids = students.map((s) => s.id);
    const [marks, remarks, nonMarks, nonSubjects] = await Promise.all([
      db.studentMark.findMany({ where: { schoolId, examId, studentId: { in: ids } } }),
      db.reportCardRemark.findMany({ where: { schoolId, academicYearId, term, studentId: { in: ids } } }),
      db.nonSubjectMark.findMany({ where: { schoolId, term, studentId: { in: ids } } }),
      db.nonSubject.findMany({ where: { schoolId, OR: [{ classId: sec.classId }, { classId: null }], enabled: true }, select: { id: true, name: true, totalMarks: true } }),
    ]);
    const markKey = new Map(marks.map((m) => [`${m.studentId}|${m.subjectId}`, m.marks]));
    const remarkBy = new Map(remarks.map((r) => [r.studentId, r.remark]));
    const nonKey = new Map(nonMarks.map((m) => [`${m.studentId}|${m.nonSubjectId}`, m.marks]));

    let generated = 0;
    for (const s of students) {
      let obtained = 0; let total = 0;
      const subjectRows = cols.map((c) => {
        const scored = markKey.get(`${s.id}|${c.id}`);
        total += c.total;
        if (typeof scored === 'number') obtained += scored;
        return { subject: c.name, total: c.total, scored: typeof scored === 'number' ? scored : null };
      });
      const nonRows = nonSubjects.map((n) => ({ name: n.name, total: n.totalMarks, scored: nonKey.get(`${s.id}|${n.id}`) ?? null }));
      const pct = total ? Math.round((obtained / total) * 100) : 0;
      const grade = await this.gradeFor(schoolId, pct);
      const cardData = {
        student: { name: s.name, rollNumber: s.rollNumber, registrationNo: s.registrationNo, fatherName: s.fatherName },
        className: sec.class.name, sectionName: sec.name, exam: exam.name, term,
        subjects: subjectRows, nonSubjects: nonRows,
        obtained, total, percentage: pct, grade, remark: remarkBy.get(s.id) || '',
      };
      await db.generatedReportCard.upsert({
        where: { studentId_academicYearId_term: { studentId: s.id, academicYearId, term } },
        update: { data: cardData as any, sectionId },
        create: { schoolId, studentId: s.id, sectionId, academicYearId, term, data: cardData as any },
      });
      generated++;
    }
    return { message: 'Report card generated successfully', generated };
  }

  async listReportCards(schoolId: string, sectionId: string, academicYearId: string | null, term: string) {
    const cards = await db.generatedReportCard.findMany({
      where: { schoolId, sectionId, academicYearId, ...(term ? { term } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return cards.map((c) => ({ id: c.id, studentId: c.studentId, term: c.term, published: c.published, data: c.data }));
  }

  async publishReportCards(schoolId: string, data: any) {
    const { sectionId } = data;
    const academicYearId = data.academicYearId || null;
    const term = data.term || '';
    const published = data.published !== false;
    const res = await db.generatedReportCard.updateMany({
      where: { schoolId, sectionId, academicYearId, term },
      data: { published, publishedAt: published ? new Date() : null },
    });
    return { message: published ? 'Report cards published' : 'Report cards unpublished', count: res.count };
  }
}

export default new ResultMgmtService();
