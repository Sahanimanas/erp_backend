import { db } from '@common/database/client';

/**
 * Exam management: grading scale, per-class exam schedule, exam halls,
 * seat allocation (sitting plan / hall tickets) and per-paper attendance.
 * Kept separate from ExamsService (exam CRUD + marks/results).
 */
export class ExamMgmtService {
  // ── Grading scale ─────────────────────────────────────────────────────────
  async listGrades(schoolId: string) {
    return db.gradingScale.findMany({ where: { schoolId }, orderBy: { minPercent: 'desc' } });
  }

  /** Bulk upsert grade bands (keyed by grade letter). */
  async saveGrades(schoolId: string, items: any[]) {
    if (!Array.isArray(items) || !items.length) throw new Error('items[] required');
    let saved = 0;
    for (const it of items) {
      if (!it.grade) continue;
      const data = {
        minPercent: Number(it.minPercent) || 0,
        maxPercent: Number(it.maxPercent) || 0,
        gradePoint: it.gradePoint === undefined || it.gradePoint === null || it.gradePoint === '' ? null : Number(it.gradePoint),
        remarks: it.remarks || null,
      };
      await db.gradingScale.upsert({
        where: { schoolId_grade: { schoolId, grade: String(it.grade).trim() } },
        update: data,
        create: { schoolId, grade: String(it.grade).trim(), ...data },
      });
      saved++;
    }
    return { saved };
  }

  async deleteGrade(schoolId: string, id: string) {
    const g = await db.gradingScale.findFirst({ where: { id, schoolId } });
    if (!g) throw new Error('Grade not found');
    await db.gradingScale.delete({ where: { id } });
    return { message: 'Grade deleted' };
  }

  // ── Exam schedule ─────────────────────────────────────────────────────────
  async getSchedule(schoolId: string, examId: string, classId?: string) {
    const where: any = { schoolId, examId };
    if (classId) where.classId = classId;
    return db.examSchedule.findMany({
      where,
      include: {
        subject: { select: { id: true, name: true, code: true } },
        class: { select: { id: true, name: true } },
        invigilator: {
          select: { id: true, user: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: [{ examDate: 'asc' }, { startTime: 'asc' }],
    });
  }

  /**
   * Upsert schedule rows for one exam+class. A subject may carry several papers
   * (Theory / Oral / …), so rows are keyed by subject + paperName; a row that
   * already exists on the client sends its `id` and is updated in place, which
   * is what lets a paper be renamed without leaving a duplicate behind.
   */
  async saveSchedule(schoolId: string, examId: string, classId: string, items: any[]) {
    if (!classId) throw new Error('classId is required');
    if (!Array.isArray(items)) throw new Error('items[] required');
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId, deletedAt: null } });
    if (!exam) throw new Error('Exam not found');

    // Papers may only be scheduled inside the exam's date window.
    const windowStart = new Date(exam.startDate); windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(exam.endDate); windowEnd.setHours(23, 59, 59, 999);
    const fmt = (d: Date) => d.toLocaleDateString('en-GB');

    let saved = 0;
    for (const it of items) {
      if (!it.subjectId || !it.examDate) continue;
      const examDate = new Date(it.examDate);
      if (isNaN(examDate.getTime())) continue;
      if (examDate < windowStart || examDate > windowEnd) {
        throw new Error(`Paper dates must be within the exam window ${fmt(windowStart)} – ${fmt(windowEnd)}`);
      }
      const paperName = String(it.paperName || '').trim() || 'Theory';
      const data = {
        paperName,
        examDate,
        startTime: it.startTime || '09:00',
        endTime: it.endTime || '12:00',
        room: it.room || null,
        examCode: it.examCode || null,
        invigilatorId: it.invigilatorId || null,
        subSubject: Boolean(it.subSubject),
        maxMarks: Number(it.maxMarks) || 100,
        // 0 is a legitimate cut-off, so don't let `||` swallow it.
        minMarks: Number.isFinite(Number(it.minMarks)) ? Number(it.minMarks) : 33,
      };

      if (it.id) {
        // Guard the tenant: only update a row that belongs to this school+exam.
        const existing = await db.examSchedule.findFirst({
          where: { id: it.id, schoolId, examId, classId },
        });
        if (existing) {
          await db.examSchedule.update({ where: { id: existing.id }, data });
          saved++;
          continue;
        }
      }

      await db.examSchedule.upsert({
        where: {
          examId_classId_subjectId_paperName: { examId, classId, subjectId: it.subjectId, paperName },
        },
        update: data,
        create: { schoolId, examId, classId, subjectId: it.subjectId, ...data },
      });
      saved++;
    }
    return { saved };
  }

  async deleteScheduleItem(schoolId: string, id: string) {
    const item = await db.examSchedule.findFirst({ where: { id, schoolId } });
    if (!item) throw new Error('Schedule item not found');
    await db.examSchedule.delete({ where: { id } });
    return { message: 'Schedule item deleted' };
  }

  /** Set publish status on an exam (publish page). */
  async setExamStatus(schoolId: string, examId: string, status: string) {
    if (!['draft', 'published', 'closed'].includes(status)) throw new Error('Invalid status');
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId, deletedAt: null } });
    if (!exam) throw new Error('Exam not found');
    return db.exam.update({ where: { id: examId }, data: { status } });
  }

  // ── Exam halls ────────────────────────────────────────────────────────────
  async listHalls(schoolId: string) {
    const halls = await db.examHall.findMany({
      where: { schoolId, deletedAt: null },
      orderBy: { name: 'asc' },
      include: { _count: { select: { seats: true } } },
    });
    return halls.map((h) => ({ ...h, totalSeatsAllocated: h._count.seats }));
  }

  async upsertHall(schoolId: string, data: any) {
    if (!data.name) throw new Error('Hall name is required');
    const payload = { name: String(data.name).trim(), roomNo: data.roomNo || null, capacity: Number(data.capacity) || 0 };
    if (data.id) {
      const h = await db.examHall.findFirst({ where: { id: data.id, schoolId } });
      if (!h) throw new Error('Hall not found');
      return db.examHall.update({ where: { id: data.id }, data: payload });
    }
    const existing = await db.examHall.findFirst({ where: { schoolId, name: payload.name, deletedAt: null } });
    if (existing) throw new Error('A hall with this name already exists');
    return db.examHall.create({ data: { schoolId, ...payload } });
  }

  async deleteHall(schoolId: string, id: string) {
    const h = await db.examHall.findFirst({ where: { id, schoolId } });
    if (!h) throw new Error('Hall not found');
    await db.examHall.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Hall deleted' };
  }

  // ── Seating (sitting plan) ────────────────────────────────────────────────
  /**
   * Auto-allocate seats for an exam: students of the selected classes (ordered
   * class → roll number) fill the selected halls in order, seat numbers
   * "<HALL>-001". Replaces any previous allocation for those students' classes.
   */
  async generateSeating(schoolId: string, examId: string, classIds: string[], hallIds: string[]) {
    if (!Array.isArray(classIds) || !classIds.length) throw new Error('classIds[] required');
    if (!Array.isArray(hallIds) || !hallIds.length) throw new Error('hallIds[] required');
    const exam = await db.exam.findFirst({ where: { id: examId, schoolId, deletedAt: null } });
    if (!exam) throw new Error('Exam not found');

    const halls = await db.examHall.findMany({ where: { schoolId, id: { in: hallIds }, deletedAt: null }, orderBy: { name: 'asc' } });
    if (!halls.length) throw new Error('No valid halls selected');
    const capacity = halls.reduce((s, h) => s + h.capacity, 0);

    const students = await db.student.findMany({
      where: { schoolId, deletedAt: null, section: { classId: { in: classIds } } },
      select: { id: true, rollNumber: true, section: { select: { name: true, class: { select: { name: true } } } } },
      orderBy: [{ sectionId: 'asc' }, { rollNumber: 'asc' }],
    });
    if (!students.length) throw new Error('No students found in the selected classes');
    if (capacity > 0 && students.length > capacity) {
      throw new Error(`Selected halls seat ${capacity} but ${students.length} students need seats`);
    }

    // Replace previous allocation for these students only (other classes keep theirs).
    await db.examSeat.deleteMany({ where: { schoolId, examId, studentId: { in: students.map((s) => s.id) } } });

    const rows: any[] = [];
    let hallIdx = 0, seatInHall = 0;
    for (const s of students) {
      // Move to the next hall when the current one is full (capacity 0 = unlimited).
      while (halls[hallIdx].capacity > 0 && seatInHall >= halls[hallIdx].capacity) {
        hallIdx++; seatInHall = 0;
        if (hallIdx >= halls.length) throw new Error('Ran out of hall capacity while allocating');
      }
      seatInHall++;
      rows.push({
        schoolId, examId,
        hallId: halls[hallIdx].id,
        studentId: s.id,
        seatNo: `${halls[hallIdx].name}-${String(seatInHall).padStart(3, '0')}`,
      });
    }
    await db.examSeat.createMany({ data: rows });
    return { allocated: rows.length, halls: halls.length };
  }

  async getSeating(schoolId: string, examId: string, hallId?: string, classId?: string) {
    const where: any = { schoolId, examId };
    if (hallId) where.hallId = hallId;
    if (classId) where.student = { section: { classId } };
    const seats = await db.examSeat.findMany({
      where,
      include: {
        hall: { select: { id: true, name: true, roomNo: true } },
        student: {
          select: {
            id: true, rollNumber: true,
            user: { select: { firstName: true, lastName: true } },
            section: { select: { name: true, class: { select: { id: true, name: true } } } },
          },
        },
      },
      orderBy: [{ hallId: 'asc' }, { seatNo: 'asc' }],
    });
    return seats.map((s) => ({
      id: s.id,
      seatNo: s.seatNo,
      hall: s.hall,
      studentId: s.student.id,
      rollNumber: s.student.rollNumber,
      name: `${s.student.user?.firstName ?? ''} ${s.student.user?.lastName ?? ''}`.trim(),
      className: s.student.section?.class?.name,
      sectionName: s.student.section?.name,
    }));
  }

  /** Per-hall summary for an exam: capacity vs allocated. */
  async hallPlan(schoolId: string, examId: string) {
    const halls = await db.examHall.findMany({ where: { schoolId, deletedAt: null }, orderBy: { name: 'asc' } });
    const counts = await db.examSeat.groupBy({ by: ['hallId'], where: { schoolId, examId }, _count: { _all: true } });
    const byHall = new Map(counts.map((c) => [c.hallId, c._count._all]));
    return halls.map((h) => ({
      id: h.id, name: h.name, roomNo: h.roomNo, capacity: h.capacity,
      allocated: byHall.get(h.id) ?? 0,
    }));
  }

  /**
   * Hall tickets for one exam + class: each student with their seat and the
   * class's paper schedule (shared across students of the class).
   */
  async hallTickets(schoolId: string, examId: string, classId: string) {
    if (!classId) throw new Error('classId is required');
    const [exam, school, schedule, students, seats] = await Promise.all([
      db.exam.findFirst({ where: { id: examId, schoolId, deletedAt: null }, include: { academicYear: { select: { name: true } } } }),
      db.school.findUnique({ where: { id: schoolId }, select: { name: true, address: true } }),
      this.getSchedule(schoolId, examId, classId),
      db.student.findMany({
        where: { schoolId, deletedAt: null, section: { classId } },
        select: {
          id: true, rollNumber: true, fatherName: true, photo: true,
          user: { select: { firstName: true, lastName: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
        orderBy: { rollNumber: 'asc' },
      }),
      db.examSeat.findMany({ where: { schoolId, examId }, include: { hall: { select: { name: true, roomNo: true } } } }),
    ]);
    if (!exam) throw new Error('Exam not found');
    const seatByStudent = new Map(seats.map((s) => [s.studentId, s]));
    return {
      exam: { id: exam.id, name: exam.name, type: exam.type, startDate: exam.startDate, endDate: exam.endDate, session: exam.academicYear?.name ?? null },
      school,
      schedule: schedule.map((s) => ({
        // Show the paper alongside the subject so "Sanskrit (Oral)" reads as its
        // own line — a subject can have more than one paper in an exam.
        subject: s.paperName && s.paperName !== 'Theory' ? `${s.subject?.name} (${s.paperName})` : s.subject?.name,
        examDate: s.examDate, startTime: s.startTime, endTime: s.endTime, room: s.room, maxMarks: s.maxMarks,
      })),
      students: students.map((st) => {
        const seat = seatByStudent.get(st.id);
        return {
          id: st.id,
          rollNumber: st.rollNumber,
          name: `${st.user?.firstName ?? ''} ${st.user?.lastName ?? ''}`.trim(),
          fatherName: st.fatherName,
          photo: st.photo,
          className: st.section?.class?.name,
          sectionName: st.section?.name,
          seatNo: seat?.seatNo ?? null,
          hall: seat?.hall?.name ?? null,
          room: seat?.hall?.roomNo ?? null,
        };
      }),
    };
  }

  // ── Exam attendance (per paper) ───────────────────────────────────────────
  /** Roster for one schedule row: every student of the class + saved status. */
  async getAttendance(schoolId: string, scheduleId: string) {
    const schedule = await db.examSchedule.findFirst({
      where: { id: scheduleId, schoolId },
      include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } }, exam: { select: { name: true } } },
    });
    if (!schedule) throw new Error('Schedule item not found');
    const [students, records] = await Promise.all([
      db.student.findMany({
        where: { schoolId, deletedAt: null, section: { classId: schedule.classId } },
        select: { id: true, rollNumber: true, user: { select: { firstName: true, lastName: true } }, section: { select: { name: true } } },
        orderBy: { rollNumber: 'asc' },
      }),
      db.examAttendance.findMany({ where: { schoolId, scheduleId } }),
    ]);
    const byStudent = new Map(records.map((r) => [r.studentId, r]));
    return {
      schedule: {
        id: schedule.id, examName: schedule.exam?.name, subject: schedule.subject?.name,
        className: schedule.class?.name, examDate: schedule.examDate, startTime: schedule.startTime, endTime: schedule.endTime,
      },
      students: students.map((s) => ({
        studentId: s.id,
        rollNumber: s.rollNumber,
        name: `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim(),
        sectionName: s.section?.name,
        status: byStudent.get(s.id)?.status ?? null,
        remarks: byStudent.get(s.id)?.remarks ?? null,
      })),
    };
  }

  async saveAttendance(schoolId: string, scheduleId: string, records: any[]) {
    if (!Array.isArray(records) || !records.length) throw new Error('records[] required');
    const schedule = await db.examSchedule.findFirst({ where: { id: scheduleId, schoolId } });
    if (!schedule) throw new Error('Schedule item not found');
    let saved = 0;
    for (const r of records) {
      if (!r.studentId || !['PRESENT', 'ABSENT'].includes(r.status)) continue;
      await db.examAttendance.upsert({
        where: { scheduleId_studentId: { scheduleId, studentId: r.studentId } },
        update: { status: r.status, remarks: r.remarks || null },
        create: { schoolId, scheduleId, studentId: r.studentId, status: r.status, remarks: r.remarks || null },
      });
      saved++;
    }
    return { saved };
  }
}

export default new ExamMgmtService();
