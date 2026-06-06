import { db } from '@common/database/client';

export class SectionService {
  async listSections(schoolId: string, classId?: string) {
    const where: any = { schoolId };

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
      },
      orderBy: [{ class: { name: 'asc' } }, { name: 'asc' }],
    });

    return sections;
  }
}

export default new SectionService();
