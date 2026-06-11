import { db } from '@common/database/client';
import {
  CreateAcademicYearRequest,
  UpdateAcademicYearRequest,
  CreateClassRequest,
  UpdateClassRequest,
  CreateSectionRequest,
  UpdateSectionRequest,
  CreateSubjectRequest,
  UpdateSubjectRequest,
  AssignTeacherToSubjectRequest,
} from './types';

export class AcademicService {
  /**
   * Find the school's most recent academic year, creating a default one
   * (Apr–Mar of the current cycle) when the school has none yet. Used so a
   * class can be created from just a name (the year is optional in the UI).
   */
  private async ensureAcademicYearId(schoolId: string, preferred?: string) {
    if (preferred) return preferred;
    let year = await db.academicYear.findFirst({
      where: { schoolId },
      orderBy: { createdAt: 'desc' },
    });
    if (!year) {
      const now = new Date();
      const y = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      year = await db.academicYear.create({
        data: {
          schoolId,
          name: `${y}-${y + 1}`,
          startDate: new Date(`${y}-04-01`),
          endDate: new Date(`${y + 1}-03-31`),
          isActive: true,
        },
      });
    }
    return year.id;
  }

  /**
   * Create academic year
   */
  async createAcademicYear(schoolId: string, data: CreateAcademicYearRequest) {
    const { name } = data;

    const existing = await db.academicYear.findFirst({
      where: {
        schoolId,
        name,
      },
    });

    if (existing) {
      throw new Error('Academic year with this name already exists');
    }

    const year = await db.academicYear.create({
      data: {
        schoolId,
        name,
        startDate: data.startDate,
        endDate: data.endDate,
      },
    });

    return year;
  }

  /**
   * Update academic year
   */
  async updateAcademicYear(schoolId: string, yearId: string, data: UpdateAcademicYearRequest) {
    const year = await db.academicYear.findFirst({
      where: {
        id: yearId,
        schoolId,
      },
    });

    if (!year) {
      throw new Error('Academic year not found');
    }

    const updated = await db.academicYear.update({
      where: { id: yearId },
      data,
    });

    return updated;
  }

  /**
   * List academic years
   */
  async listAcademicYears(schoolId: string) {
    const years = await db.academicYear.findMany({
      where: { schoolId },
      orderBy: { startDate: 'desc' },
    });

    return years;
  }

  /**
   * Get academic year by ID
   */
  async getAcademicYearById(schoolId: string, yearId: string) {
    const year = await db.academicYear.findFirst({
      where: {
        id: yearId,
        schoolId,
      },
      include: {
        classes: true,
      },
    });

    if (!year) {
      throw new Error('Academic year not found');
    }

    return year;
  }

  /**
   * Create class
   */
  async createClass(schoolId: string, data: CreateClassRequest) {
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Class name is required');

    // The unique constraint is (schoolId, name) and includes soft-deleted rows.
    // If a class with this name exists, restore it when it was deleted, else
    // reject the duplicate.
    const existing = await db.class.findFirst({ where: { schoolId, name } });
    if (existing) {
      if (existing.deletedAt) {
        return db.class.update({
          where: { id: existing.id },
          data: {
            deletedAt: null,
            description: data.description ?? existing.description,
            classTeacherId: data.classTeacherId ?? existing.classTeacherId,
            ...(data.academicYearId ? { academicYearId: data.academicYearId } : {}),
          },
        });
      }
      throw new Error('Class with this name already exists');
    }

    const academicYearId = await this.ensureAcademicYearId(schoolId, data.academicYearId);
    const cls = await db.class.create({
      data: {
        schoolId,
        academicYearId,
        name,
        description: data.description,
        classTeacherId: data.classTeacherId,
      },
    });

    return cls;
  }

  /**
   * Update class
   */
  async updateClass(schoolId: string, classId: string, data: UpdateClassRequest) {
    const cls = await db.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    const updated = await db.class.update({
      where: { id: classId },
      data,
    });

    return updated;
  }

  /**
   * List classes
   */
  async listClasses(schoolId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [classes, total] = await Promise.all([
      db.class.findMany({
        where: { schoolId, deletedAt: null },
        skip,
        take: limit,
        include: {
          sections: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              strength: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      db.class.count({ where: { schoolId, deletedAt: null } }),
    ]);

    return {
      data: classes,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get class by ID
   */
  async getClassById(schoolId: string, classId: string) {
    const cls = await db.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
      include: {
        sections: {
          include: {
            students: {
              select: {
                id: true,
                user: {
                  select: {
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        classSubjects: {
          include: {
            subject: true,
          },
        },
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    return cls;
  }

  /**
   * Delete class
   */
  async deleteClass(schoolId: string, classId: string) {
    const cls = await db.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    await db.class.update({
      where: { id: classId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Class deleted successfully' };
  }

  /**
   * Create section
   */
  async createSection(schoolId: string, data: CreateSectionRequest) {
    const classId = data.classId;
    const name = String(data.name || '').trim();
    if (!name) throw new Error('Section name is required');

    const cls = await db.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    // Unique (classId, name) spans soft-deleted rows — restore on re-add.
    const existing = await db.section.findFirst({ where: { classId, name } });
    if (existing) {
      if (existing.deletedAt) {
        return db.section.update({
          where: { id: existing.id },
          data: { deletedAt: null, strength: data.strength ?? existing.strength },
        });
      }
      throw new Error('Section with this name already exists in this class');
    }

    const section = await db.section.create({
      data: {
        classId,
        schoolId,
        name,
        strength: data.strength || 0,
      },
    });

    return section;
  }

  /**
   * Update section
   */
  async updateSection(schoolId: string, sectionId: string, data: UpdateSectionRequest) {
    const section = await db.section.findFirst({
      where: {
        id: sectionId,
        schoolId,
      },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    const updated = await db.section.update({
      where: { id: sectionId },
      data,
    });

    return updated;
  }

  /**
   * List sections
   */
  async listSections(schoolId: string, classId?: string) {
    const where: any = { schoolId, deletedAt: null };
    if (classId) {
      where.classId = classId;
    }

    const sections = await db.section.findMany({
      where,
      include: {
        class: {
          select: {
            id: true,
            name: true,
          },
        },
        students: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return sections;
  }

  /**
   * Get section by ID
   */
  async getSectionById(schoolId: string, sectionId: string) {
    const section = await db.section.findFirst({
      where: {
        id: sectionId,
        schoolId,
      },
      include: {
        class: true,
        students: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    return section;
  }

  /**
   * Delete section
   */
  async deleteSection(schoolId: string, sectionId: string) {
    const section = await db.section.findFirst({
      where: {
        id: sectionId,
        schoolId,
      },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    // Check if section has students
    const studentCount = await db.student.count({
      where: { sectionId },
    });

    if (studentCount > 0) {
      throw new Error('Cannot delete section with students');
    }

    await db.section.update({
      where: { id: sectionId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Section deleted successfully' };
  }

  /**
   * Create subject
   */
  async createSubject(schoolId: string, data: CreateSubjectRequest) {
    const { code } = data;

    const existing = await db.subject.findFirst({
      where: {
        schoolId,
        code,
      },
    });

    if (existing) {
      throw new Error('Subject with this code already exists');
    }

    const subject = await db.subject.create({
      data: {
        schoolId,
        name: data.name,
        code,
        description: data.description,
      },
    });

    return subject;
  }

  /**
   * Update subject
   */
  async updateSubject(schoolId: string, subjectId: string, data: UpdateSubjectRequest) {
    const subject = await db.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    const updated = await db.subject.update({
      where: { id: subjectId },
      data,
    });

    return updated;
  }

  /**
   * List subjects
   */
  async listSubjects(schoolId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [subjects, total] = await Promise.all([
      db.subject.findMany({
        where: { schoolId },
        skip,
        take: limit,
        include: {
          classSubjects: {
            select: {
              id: true,
            },
          },
        },
        orderBy: { name: 'asc' },
      }),
      db.subject.count({ where: { schoolId } }),
    ]);

    return {
      data: subjects,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get subject by ID
   */
  async getSubjectById(schoolId: string, subjectId: string) {
    const subject = await db.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
      include: {
        classSubjects: {
          include: {
            class: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    return subject;
  }

  /**
   * Delete subject
   */
  async deleteSubject(schoolId: string, subjectId: string) {
    const subject = await db.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    await db.subject.update({
      where: { id: subjectId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Subject deleted successfully' };
  }

  /**
   * Assign teacher to subject in class
   */
  async assignTeacherToSubject(schoolId: string, data: AssignTeacherToSubjectRequest) {
    const { classId, subjectId, teacherId } = data;

    // Verify class exists
    const cls = await db.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    // Verify subject exists
    const subject = await db.subject.findFirst({
      where: {
        id: subjectId,
        schoolId,
      },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    // Verify teacher exists
    const teacher = await db.employee.findUnique({
      where: { id: teacherId },
    });

    if (!teacher) {
      throw new Error('Teacher not found');
    }

    // Check if assignment already exists
    const existing = await db.classSubject.findUnique({
      where: {
        classId_subjectId: {
          classId,
          subjectId,
        },
      },
    });

    if (existing) {
      // Update existing assignment
      const updated = await db.classSubject.update({
        where: {
          classId_subjectId: {
            classId,
            subjectId,
          },
        },
        data: { teacherId },
        include: {
          subject: true,
        },
      });

      return updated;
    }

    // Create new assignment
    const assignment = await db.classSubject.create({
      data: {
        classId,
        subjectId,
        teacherId,
      },
      include: {
        subject: true,
      },
    });

    return assignment;
  }

  /**
   * Get class timetable
   */
  async getClassTimetable(schoolId: string, classId: string) {
    const cls = await db.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
      include: {
        sections: {
          include: {
            timetableSlots: {
              include: {
                period: true,
              },
              orderBy: [{ day: 'asc' }, { period: { startTime: 'asc' } }],
            },
          },
        },
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    return cls;
  }

  /**
   * List class subjects
   */
  async listClassSubjects(schoolId: string, classId: string) {
    const cls = await db.class.findFirst({
      where: {
        id: classId,
        schoolId,
      },
    });

    if (!cls) {
      throw new Error('Class not found');
    }

    const subjects = await db.classSubject.findMany({
      where: { classId },
      include: {
        subject: true,
        class: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        subject: {
          name: 'asc',
        },
      },
    });

    return subjects;
  }
}

export default new AcademicService();
