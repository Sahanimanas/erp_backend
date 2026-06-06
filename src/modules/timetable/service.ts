import { db } from '@common/database/client';
import { CreatePeriodRequest, UpdatePeriodRequest, CreateTimetableSlotRequest, UpdateTimetableSlotRequest } from './types';

export class TimetableService {
  /**
   * Create period
   */
  async createPeriod(schoolId: string, data: CreatePeriodRequest) {
    const { name } = data;

    const existing = await db.period.findFirst({
      where: { schoolId, name },
    });

    if (existing) {
      throw new Error('Period already exists');
    }

    const period = await db.period.create({
      data: {
        schoolId,
        name,
        startTime: data.startTime,
        endTime: data.endTime,
      },
    });

    return period;
  }

  /**
   * List periods
   */
  async listPeriods(schoolId: string) {
    const periods = await db.period.findMany({
      where: { schoolId },
      include: {
        timetableSlots: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { startTime: 'asc' },
    });

    return periods;
  }

  /**
   * Update period
   */
  async updatePeriod(schoolId: string, periodId: string, data: UpdatePeriodRequest) {
    const period = await db.period.findFirst({
      where: { id: periodId, schoolId },
    });

    if (!period) {
      throw new Error('Period not found');
    }

    const updated = await db.period.update({
      where: { id: periodId },
      data,
    });

    return updated;
  }

  /**
   * Create timetable slot
   */
  async createTimetableSlot(schoolId: string, data: CreateTimetableSlotRequest) {
    const { sectionId, periodId, subjectId, day } = data;

    const section = await db.section.findFirst({
      where: { id: sectionId, schoolId },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    const period = await db.period.findFirst({
      where: { id: periodId, schoolId },
    });

    if (!period) {
      throw new Error('Period not found');
    }

    const subject = await db.subject.findFirst({
      where: { id: subjectId, schoolId },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    // Check for double booking (same period and day)
    const existing = await db.timetableSlot.findUnique({
      where: {
        schoolId_sectionId_periodId_day: {
          schoolId,
          sectionId,
          periodId,
          day,
        },
      },
    });

    if (existing) {
      throw new Error('Slot already exists for this period and day');
    }

    const slot = await db.timetableSlot.create({
      data: {
        schoolId,
        sectionId,
        periodId,
        subjectId,
        day,
      },
      include: {
        section: {
          select: {
            name: true,
            class: {
              select: {
                name: true,
              },
            },
          },
        },
        period: true,
      },
    });

    return slot;
  }

  /**
   * Get section timetable
   */
  async getSectionTimetable(schoolId: string, sectionId: string) {
    const section = await db.section.findFirst({
      where: { id: sectionId, schoolId },
      include: { class: true },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    const slots = await db.timetableSlot.findMany({
      where: { schoolId, sectionId },
      include: {
        period: true,
      },
      orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
    });

    // Group by day
    const timetable: any = {};
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

    days.forEach(day => {
      timetable[day] = slots.filter(s => s.day === day);
    });

    return {
      section: {
        id: section.id,
        name: section.name,
        class: section.class,
      },
      timetable,
    };
  }

  /**
   * Get teacher schedule
   */
  async getTeacherSchedule(schoolId: string, employeeId: string) {
    const employee = await db.employee.findFirst({
      where: { id: employeeId, schoolId },
      include: { user: true },
    });

    if (!employee) {
      throw new Error('Employee not found');
    }

    // Get all classes where this teacher teaches
    const classSubjects = await db.classSubject.findMany({
      where: { teacherId: employeeId },
      select: {
        subjectId: true,
        class: {
          select: {
            id: true,
            name: true,
            sections: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (classSubjects.length === 0) {
      return { teacher: employee.user, schedule: {} };
    }

    // Get timetable slots for all sections
    const sectionIds = classSubjects.flatMap(cs => cs.class.sections.map(s => s.id));

    const slots = await db.timetableSlot.findMany({
      where: {
        schoolId,
        sectionId: { in: sectionIds },
        subjectId: { in: classSubjects.map(cs => cs.subjectId) },
      },
      include: {
        section: true,
        period: true,
      },
      orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
    });

    // Group by day
    const schedule: any = {};
    const days = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

    days.forEach(day => {
      schedule[day] = slots.filter(s => s.day === day);
    });

    return {
      teacher: employee.user,
      schedule,
    };
  }

  /**
   * Update timetable slot
   */
  async updateTimetableSlot(schoolId: string, slotId: string, data: UpdateTimetableSlotRequest) {
    const slot = await db.timetableSlot.findFirst({
      where: { id: slotId, schoolId },
    });

    if (!slot) {
      throw new Error('Timetable slot not found');
    }

    const updated = await db.timetableSlot.update({
      where: { id: slotId },
      data,
    });

    return updated;
  }

  /**
   * Delete timetable slot
   */
  async deleteTimetableSlot(schoolId: string, slotId: string) {
    const slot = await db.timetableSlot.findFirst({
      where: { id: slotId, schoolId },
    });

    if (!slot) {
      throw new Error('Timetable slot not found');
    }

    await db.timetableSlot.delete({
      where: { id: slotId },
    });

    return { message: 'Timetable slot deleted' };
  }

  /**
   * Get class schedule
   */
  async getClassSchedule(schoolId: string, classId: string) {
    const cls = await db.class.findFirst({
      where: { id: classId, schoolId },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    const sections = await db.section.findMany({
      where: { classId },
      include: {
        timetableSlots: {
          include: {
            period: true,
          },
          orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
        },
      },
    });

    return {
      class: cls,
      sections,
    };
  }
}

export default new TimetableService();
