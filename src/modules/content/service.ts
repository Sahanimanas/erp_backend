import { db } from '@common/database/client';

export const CONTENT_TYPES = ['HOMEWORK', 'DIARY', 'SYLLABUS', 'HOLIDAY', 'EVENT', 'ONLINE_CLASS', 'STUDY_DOC'] as const;
export type ContentTypeStr = (typeof CONTENT_TYPES)[number];

export class ContentService {
  /** Items a student can see: whole-school (sectionId null) + their own section. */
  async listForStudent(schoolId: string, userId: string, type: ContentTypeStr) {
    const student = await db.student.findFirst({ where: { userId, schoolId }, select: { sectionId: true } });
    const sectionId = student?.sectionId ?? null;
    return db.classContent.findMany({
      where: {
        schoolId,
        type: type as any,
        deletedAt: null,
        OR: sectionId ? [{ sectionId: null }, { sectionId }] : [{ sectionId: null }],
      },
      orderBy: [{ date: 'desc' }, { dueDate: 'desc' }, { createdAt: 'desc' }],
      take: 100,
    });
  }

  /** Admin/teacher create. */
  async create(schoolId: string, createdBy: string, body: any) {
    return db.classContent.create({
      data: {
        schoolId,
        type: body.type,
        title: body.title,
        description: body.description || null,
        subjectName: body.subjectName || null,
        sectionId: body.sectionId || null,
        date: body.date ? new Date(body.date) : null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        link: body.link || null,
        createdBy,
      },
    });
  }
}

export default new ContentService();
