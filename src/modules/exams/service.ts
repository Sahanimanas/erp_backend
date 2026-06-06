import { db } from '@common/database/client';
import { CreateExamRequest, AddExamSubjectRequest, EnterStudentMarksRequest } from './types';

export class ExamsService {
  /**
   * Create exam
   */
  async createExam(schoolId: string, data: CreateExamRequest) {
    const { name } = data;

    const existing = await db.exam.findFirst({
      where: { schoolId, name },
    });

    if (existing) {
      throw new Error('Exam with this name already exists');
    }

    // Coerce date-only strings (from <input type="date">) to Date for Prisma.
    const startDate = new Date(data.startDate);
    const endDate = new Date(data.endDate);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error('Valid start and end dates are required');
    }

    const exam = await db.exam.create({
      data: {
        schoolId,
        name,
        type: data.type,
        startDate,
        endDate,
      },
    });

    return exam;
  }

  /**
   * List exams
   */
  async listExams(schoolId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [exams, total] = await Promise.all([
      db.exam.findMany({
        where: { schoolId },
        skip,
        take: limit,
        include: {
          subjects: {
            select: {
              id: true,
              subject: {
                select: {
                  name: true,
                },
              },
            },
          },
          marks: {
            select: {
              id: true,
            },
          },
        },
        orderBy: { startDate: 'desc' },
      }),
      db.exam.count({ where: { schoolId } }),
    ]);

    return {
      data: exams,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get exam by ID
   */
  async getExamById(schoolId: string, examId: string) {
    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId },
      include: {
        subjects: {
          include: {
            subject: true,
          },
        },
      },
    });

    if (!exam) {
      throw new Error('Exam not found');
    }

    return exam;
  }

  /**
   * Add subject to exam
   */
  async addExamSubject(schoolId: string, data: AddExamSubjectRequest) {
    const { examId, subjectId, totalMarks, passingMarks } = data;

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId },
    });

    if (!exam) {
      throw new Error('Exam not found');
    }

    const subject = await db.subject.findFirst({
      where: { id: subjectId, schoolId },
    });

    if (!subject) {
      throw new Error('Subject not found');
    }

    const existing = await db.examSubject.findUnique({
      where: {
        examId_subjectId: {
          examId,
          subjectId,
        },
      },
    });

    if (existing) {
      // Update existing
      const updated = await db.examSubject.update({
        where: {
          examId_subjectId: {
            examId,
            subjectId,
          },
        },
        data: {
          totalMarks,
          passingMarks,
        },
        include: {
          subject: true,
        },
      });

      return updated;
    }

    const examSubject = await db.examSubject.create({
      data: {
        examId,
        subjectId,
        totalMarks,
        passingMarks,
      },
      include: {
        subject: true,
      },
    });

    return examSubject;
  }

  /**
   * Enter student marks
   */
  async enterStudentMarks(schoolId: string, data: EnterStudentMarksRequest) {
    const { studentId, examId, subjectId, marks } = data;

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId },
    });

    if (!exam) {
      throw new Error('Exam not found');
    }

    const examSubject = await db.examSubject.findUnique({
      where: {
        examId_subjectId: {
          examId,
          subjectId,
        },
      },
    });

    if (!examSubject) {
      throw new Error('Subject not added to exam');
    }

    const existing = await db.studentMark.findFirst({
      where: {
        schoolId,
        studentId,
        examId,
        subjectId,
      },
    });

    if (existing) {
      const updated = await db.studentMark.update({
        where: { id: existing.id },
        data: { marks },
      });

      return updated;
    }

    const mark = await db.studentMark.create({
      data: {
        schoolId,
        studentId,
        examId,
        subjectId,
        marks,
      },
    });

    return mark;
  }

  /**
   * Get student marks for exam
   */
  async getStudentExamMarks(schoolId: string, studentId: string, examId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const marks = await db.studentMark.findMany({
      where: {
        schoolId,
        studentId,
        examId,
      },
      include: {
        subject: {
          select: {
            name: true,
            code: true,
          },
        },
      },
    });

    return marks;
  }

  /**
   * Calculate exam result
   */
  async calculateExamResult(schoolId: string, studentId: string, examId: string) {
    const marks = await this.getStudentExamMarks(schoolId, studentId, examId);

    if (marks.length === 0) {
      throw new Error('No marks found');
    }

    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId },
      include: {
        subjects: true,
      },
    });

    if (!exam) {
      throw new Error('Exam not found');
    }

    let totalMarks = 0;
    let obtainedMarks = 0;
    let passed = true;

    marks.forEach(mark => {
      const examSubject = exam.subjects.find(s => s.subjectId === mark.subjectId);
      if (examSubject) {
        totalMarks += examSubject.totalMarks;
        obtainedMarks += mark.marks;

        if (mark.marks < examSubject.passingMarks) {
          passed = false;
        }
      }
    });

    const percentage = totalMarks === 0 ? 0 : Math.round((obtainedMarks / totalMarks) * 100);
    const grade = this.calculateGrade(percentage);

    return {
      studentId,
      examId,
      totalMarks,
      obtainedMarks,
      percentage,
      grade,
      passed,
      subjects: marks.length,
    };
  }

  /**
   * Get class rankings
   */
  async getClassRankings(schoolId: string, examId: string, sectionId: string) {
    const students = await db.student.findMany({
      where: { sectionId, schoolId },
      select: {
        id: true,
        rollNumber: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const results = await Promise.all(
      students.map(async student => {
        const result = await this.calculateExamResult(schoolId, student.id, examId);
        return {
          ...result,
          rollNumber: student.rollNumber,
          name: `${student.user.firstName} ${student.user.lastName}`,
        };
      })
    );

    // Sort by percentage descending
    results.sort((a, b) => b.percentage - a.percentage);

    // Assign ranks
    results.forEach((result: any, index) => {
      result['rank'] = index + 1;
    });

    return results;
  }

  /**
   * Calculate grade
   */
  calculateGrade(percentage: number): string {
    if (percentage >= 90) return 'A';
    if (percentage >= 80) return 'B';
    if (percentage >= 70) return 'C';
    if (percentage >= 60) return 'D';
    if (percentage >= 50) return 'E';
    return 'F';
  }

  /**
   * Get student performance
   */
  async getStudentPerformance(schoolId: string, studentId: string, startDate?: Date, endDate?: Date) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const where: any = { schoolId, studentId };

    if (startDate && endDate) {
      where.exam = {
        startDate: { gte: startDate },
        endDate: { lte: endDate },
      };
    }

    const marks = await db.studentMark.findMany({
      where,
      include: {
        exam: {
          select: {
            id: true,
            name: true,
            type: true,
            startDate: true,
          },
        },
        subject: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { exam: { startDate: 'desc' } },
    });

    // Group by exam
    const performance: any = {};
    marks.forEach(mark => {
      if (!performance[mark.examId]) {
        performance[mark.examId] = {
          exam: mark.exam,
          subjects: [],
        };
      }

      performance[mark.examId].subjects.push({
        subject: mark.subject.name,
        marks: mark.marks,
      });
    });

    return Object.values(performance);
  }

  /**
   * Delete exam
   */
  async deleteExam(schoolId: string, examId: string) {
    const exam = await db.exam.findFirst({
      where: { id: examId, schoolId },
    });

    if (!exam) {
      throw new Error('Exam not found');
    }

    await db.exam.update({
      where: { id: examId },
      data: { deletedAt: new Date() },
    });

    return { message: 'Exam deleted' };
  }
}

export default new ExamsService();
