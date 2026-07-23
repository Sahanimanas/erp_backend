import { db } from '@common/database/client';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

type CellInput = {
  day: string;
  periodIndex: number;
  startTime?: string | null;
  endTime?: string | null;
  subjectId?: string | null;
  teacherId?: string | null;
  onlineLink?: string | null;
};

type SaveTimetableInput = {
  sectionId: string;
  session?: string;            // DEFAULT | ONLINE (timetable session)
  academicYearId?: string | null;
  maxPeriods?: number;
  completed?: boolean;
  classTeacherId?: string | null;
  periodLabels?: string[];
  cells?: CellInput[];
};

export class TimetableService {
  /** Resolve the academic year to key a timetable by — the given one, else the school's active/latest. */
  private async resolveAcademicYearId(schoolId: string, academicYearId?: string | null) {
    if (academicYearId) return academicYearId;
    const active = await db.academicYear.findFirst({
      where: { schoolId, isActive: true },
      select: { id: true },
    });
    if (active) return active.id;
    const latest = await db.academicYear.findFirst({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
      select: { id: true },
    });
    return latest?.id ?? null;
  }

  /** Look-up maps of subjects + teachers so cells can be returned hydrated. */
  private async lookups(schoolId: string) {
    const [subjects, employees] = await Promise.all([
      db.subject.findMany({ where: { schoolId, deletedAt: null }, select: { id: true, name: true, code: true } }),
      db.employee.findMany({
        where: { schoolId, deletedAt: null },
        select: { id: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    const subjectById = new Map(subjects.map((s) => [s.id, s]));
    const teacherById = new Map(
      employees.map((e) => [e.id, { id: e.id, name: `${e.user.firstName} ${e.user.lastName}`.trim() }]),
    );
    return { subjectById, teacherById };
  }

  private hydrateCell(cell: any, subjectById: Map<string, any>, teacherById: Map<string, any>) {
    return {
      id: cell.id,
      day: cell.day,
      periodIndex: cell.periodIndex,
      startTime: cell.startTime,
      endTime: cell.endTime,
      subjectId: cell.subjectId,
      subject: cell.subjectId ? subjectById.get(cell.subjectId) ?? null : null,
      teacherId: cell.teacherId,
      teacher: cell.teacherId ? teacherById.get(cell.teacherId) ?? null : null,
      onlineLink: cell.onlineLink || '',
    };
  }

  /**
   * Get ONE section's timetable for a timetable-session. Returns the meta
   * (maxPeriods, completed, classTeacher, labels) and hydrated cells. This is
   * the single source the Add / View / Teacher-Allotment / View-Allotment
   * pages all read, so they stay in sync.
   */
  async getSectionTimetable(
    schoolId: string,
    sectionId: string,
    session = 'DEFAULT',
    academicYearId?: string | null,
  ) {
    const section = await db.section.findFirst({
      where: { id: sectionId, schoolId },
      select: { id: true, name: true, class: { select: { id: true, name: true } } },
    });
    if (!section) throw new Error('Section not found');

    const yearId = await this.resolveAcademicYearId(schoolId, academicYearId);
    const { subjectById, teacherById } = await this.lookups(schoolId);

    const timetable = await db.classTimetable.findFirst({
      where: { schoolId, sectionId, session, academicYearId: yearId },
      include: { cells: true },
    });

    const classTeacher = timetable?.classTeacherId
      ? teacherById.get(timetable.classTeacherId) ?? null
      : null;

    return {
      section,
      session,
      academicYearId: yearId,
      exists: !!timetable,
      maxPeriods: timetable?.maxPeriods ?? 8,
      completed: timetable?.completed ?? false,
      classTeacherId: timetable?.classTeacherId ?? null,
      classTeacher,
      periodLabels: timetable?.periodLabels ?? [],
      cells: (timetable?.cells ?? []).map((c) => this.hydrateCell(c, subjectById, teacherById)),
    };
  }

  /**
   * Upsert a whole section timetable + its cells in one transaction. Empty
   * cells (no time / subject / teacher / link) are dropped so the grid stays
   * clean. Used by both the builder (subjects + times) and the teacher
   * allotment screen (teacher per cell) — same record.
   */
  async saveSectionTimetable(schoolId: string, data: SaveTimetableInput) {
    const { sectionId } = data;
    if (!sectionId) throw new Error('sectionId required');

    const section = await db.section.findFirst({ where: { id: sectionId, schoolId } });
    if (!section) throw new Error('Section not found');

    const session = data.session === 'ONLINE' ? 'ONLINE' : 'DEFAULT';
    const yearId = await this.resolveAcademicYearId(schoolId, data.academicYearId);
    const maxPeriods = Math.min(Math.max(Number(data.maxPeriods) || 8, 1), 12);

    const isFilled = (c: CellInput) =>
      !!(c.subjectId || c.teacherId || (c.startTime && c.endTime) || c.onlineLink);
    const cells = (data.cells ?? []).filter(
      (c) => c && c.day && Number.isInteger(c.periodIndex) && c.periodIndex >= 0 && isFilled(c),
    );

    const saved = await db.$transaction(async (tx) => {
      const existing = await tx.classTimetable.findFirst({
        where: { schoolId, sectionId, session, academicYearId: yearId },
      });

      const meta = {
        maxPeriods,
        completed: !!data.completed,
        classTeacherId: data.classTeacherId || null,
        periodLabels: Array.isArray(data.periodLabels) ? data.periodLabels : [],
      };

      const timetable = existing
        ? await tx.classTimetable.update({ where: { id: existing.id }, data: meta })
        : await tx.classTimetable.create({
            data: { schoolId, sectionId, session, academicYearId: yearId, ...meta },
          });

      // Replace all cells (simplest correct sync for a full-grid save).
      await tx.classTimetableCell.deleteMany({ where: { timetableId: timetable.id } });
      if (cells.length) {
        await tx.classTimetableCell.createMany({
          data: cells.map((c) => ({
            schoolId,
            timetableId: timetable.id,
            day: c.day,
            periodIndex: c.periodIndex,
            startTime: c.startTime || null,
            endTime: c.endTime || null,
            subjectId: c.subjectId || null,
            teacherId: c.teacherId || null,
            onlineLink: c.onlineLink || null,
          })),
        });
      }
      return { id: timetable.id, cells: cells.length };
    });

    return { message: 'Timetable saved', ...saved };
  }

  /**
   * A single teacher's weekly schedule across every class/section — built from
   * the cells where they are allotted. Grouped by day.
   */
  async getEmployeeTimetable(
    schoolId: string,
    employeeId: string,
    session = 'DEFAULT',
    academicYearId?: string | null,
  ) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
      select: { id: true, user: { select: { firstName: true, lastName: true } } },
    });
    if (!employee) throw new Error('Employee not found');

    const yearId = await this.resolveAcademicYearId(schoolId, academicYearId);
    const { subjectById } = await this.lookups(schoolId);

    const cells = await db.classTimetableCell.findMany({
      where: {
        schoolId,
        teacherId: employeeId,
        timetable: { session, academicYearId: yearId },
      },
      include: {
        timetable: {
          select: { section: { select: { name: true, class: { select: { name: true } } } } },
        },
      },
      orderBy: [{ day: 'asc' }, { periodIndex: 'asc' }],
    });

    const byDay: Record<string, any[]> = {};
    DAYS.forEach((d) => (byDay[d] = []));
    for (const c of cells) {
      const bucket = byDay[c.day] ?? (byDay[c.day] = []);
      bucket.push({
        periodIndex: c.periodIndex,
        startTime: c.startTime,
        endTime: c.endTime,
        subject: c.subjectId ? subjectById.get(c.subjectId)?.name ?? null : null,
        className: c.timetable.section.class.name,
        sectionName: c.timetable.section.name,
      });
    }

    return {
      employee: { id: employee.id, name: `${employee.user.firstName} ${employee.user.lastName}`.trim() },
      session,
      academicYearId: yearId,
      days: DAYS,
      schedule: byDay,
    };
  }

  /**
   * All classes' periods for ONE weekday (the "Session Time Table" view): rows
   * are sections, columns are periods, with the allotted teacher or
   * [Not Assigned].
   */
  async getSessionDayTimetable(
    schoolId: string,
    day: string,
    session = 'DEFAULT',
    academicYearId?: string | null,
  ) {
    const yearId = await this.resolveAcademicYearId(schoolId, academicYearId);
    const { subjectById, teacherById } = await this.lookups(schoolId);

    const timetables = await db.classTimetable.findMany({
      where: { schoolId, session, academicYearId: yearId },
      include: {
        section: { select: { name: true, class: { select: { name: true } } } },
        cells: { where: { day }, orderBy: { periodIndex: 'asc' } },
      },
    });

    let maxPeriods = 0;
    const rows = timetables
      .map((t) => {
        maxPeriods = Math.max(maxPeriods, t.maxPeriods);
        return {
          sectionId: t.sectionId,
          className: t.section.class.name,
          sectionName: t.section.name,
          label: `${t.section.class.name} - ${t.section.name}`,
          periodLabels: t.periodLabels,
          cells: t.cells.map((c) => ({
            periodIndex: c.periodIndex,
            startTime: c.startTime,
            endTime: c.endTime,
            subject: c.subjectId ? subjectById.get(c.subjectId)?.name ?? null : null,
            teacher: c.teacherId ? teacherById.get(c.teacherId)?.name ?? null : null,
            onlineLink: c.onlineLink || '',
          })),
        };
      })
      .filter((r) => r.cells.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));

    return { day, session, academicYearId: yearId, maxPeriods: maxPeriods || 8, rows };
  }
}

export default new TimetableService();
