import { db } from '@common/database/client';
import { hashPassword } from '@common/utils/crypto';

interface CreateParentInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  relationship: string;
  occupation?: string;
  annualIncome?: number | string;
  studentIds?: string[];
}

interface UpdateParentInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  relationship?: string;
  occupation?: string;
  annualIncome?: number | string;
  studentIds?: string[];
}

export class ParentService {
  async createParent(schoolId: string, data: CreateParentInput) {
    // Ensure email is unique within the school
    const existingUser = await db.user.findUnique({
      where: { email_schoolId: { email: data.email, schoolId } },
    });
    if (existingUser) {
      throw new Error('Email already exists');
    }

    // Validate any students being linked belong to this school
    if (data.studentIds?.length) {
      const count = await db.student.count({
        where: { id: { in: data.studentIds }, schoolId },
      });
      if (count !== data.studentIds.length) {
        throw new Error('One or more students not found');
      }
    }

    const hashedPassword = await hashPassword(data.password);

    const user = await db.user.create({
      data: {
        schoolId,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone,
        password: hashedPassword,
        role: 'PARENT' as any,
      },
    });

    const parent = await db.parent.create({
      data: {
        schoolId,
        userId: user.id,
        relationship: data.relationship,
        occupation: data.occupation,
        annualIncome: data.annualIncome != null ? BigInt(data.annualIncome) : null,
        ...(data.studentIds?.length && {
          students: { connect: data.studentIds.map((id) => ({ id })) },
        }),
      },
      include: this.parentInclude(),
    });

    return parent;
  }

  async updateParent(schoolId: string, parentId: string, data: UpdateParentInput) {
    const parent = await db.parent.findFirst({ where: { id: parentId, schoolId } });
    if (!parent) {
      throw new Error('Parent not found');
    }

    const updated = await db.parent.update({
      where: { id: parentId },
      data: {
        relationship: data.relationship,
        occupation: data.occupation,
        annualIncome: data.annualIncome != null ? BigInt(data.annualIncome) : undefined,
        ...((data.firstName || data.lastName || data.email || data.phone) && {
          user: {
            update: {
              firstName: data.firstName,
              lastName: data.lastName,
              email: data.email,
              phone: data.phone,
            },
          },
        }),
        ...(data.studentIds && {
          students: { set: data.studentIds.map((id) => ({ id })) },
        }),
      },
      include: this.parentInclude(),
    });

    return updated;
  }

  async getParentById(schoolId: string, parentId: string) {
    const parent = await db.parent.findFirst({
      where: { id: parentId, schoolId },
      include: this.parentInclude(),
    });
    if (!parent) {
      throw new Error('Parent not found');
    }
    return parent;
  }

  /**
   * The parents list is the union of two sources:
   *
   *  1. `Parent` rows — guardians who have a real login account.
   *  2. Guardians read straight off the student records (father / mother /
   *     guardian name + mobile), for students with no Parent linked yet.
   *
   * Most schools capture guardian particulars during admission and never create
   * separate parent logins, so source (2) is what keeps this page from looking
   * empty. Derived rows carry `source: 'student'` and a synthetic `derived:*`
   * id — they are read-only, there is no row in the DB behind them.
   *
   * Siblings collapse into one guardian: rows are keyed on the mobile number
   * when there is one (digits only), otherwise on the lower-cased name.
   */
  /**
   * The logged-in parent's own children — powers the Parent mobile app. Returns
   * each linked student with the fields needed to view attendance / fees /
   * results (id, roll, photo, section + class).
   */
  async getMyChildren(schoolId: string, userId: string) {
    const parent = await db.parent.findFirst({ where: { schoolId, userId, deletedAt: null }, select: { id: true } });
    if (!parent) return [];
    const students = await db.student.findMany({
      where: { schoolId, deletedAt: null, parents: { some: { id: parent.id } } },
      select: {
        id: true, rollNumber: true, admissionNumber: true, photo: true,
        user: { select: { firstName: true, lastName: true } },
        section: { select: { id: true, name: true, class: { select: { id: true, name: true } } } },
      },
      orderBy: { rollNumber: 'asc' },
    });
    return students.map((s) => ({
      id: s.id,
      name: `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim(),
      rollNumber: s.rollNumber,
      admissionNumber: s.admissionNumber,
      photo: s.photo,
      sectionId: s.section?.id ?? null,
      sectionName: s.section?.name ?? null,
      className: s.section?.class?.name ?? null,
    }));
  }

  async listParents(schoolId: string, page = 1, limit = 10, search?: string) {
    const [parents, students] = await Promise.all([
      db.parent.findMany({
        where: { schoolId, deletedAt: null },
        include: this.parentInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      db.student.findMany({
        where: { schoolId, deletedAt: null, parents: { none: {} } },
        select: {
          id: true,
          rollNumber: true,
          fatherName: true,
          motherName: true,
          fatherOccupation: true,
          motherOccupation: true,
          guardianName: true,
          guardianPhone: true,
          guardianEmail: true,
          user: { select: { firstName: true, lastName: true, phone: true, email: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const derived = new Map<string, any>();
    for (const s of students) {
      // Prefer an explicit guardian, else the father, else the mother.
      let name = '';
      let relationship = '';
      let occupation: string | null = null;
      if (s.guardianName?.trim()) {
        name = s.guardianName.trim();
        relationship = 'Guardian';
        occupation = s.fatherOccupation || s.motherOccupation || null;
      } else if (s.fatherName?.trim()) {
        name = s.fatherName.trim();
        relationship = 'Father';
        occupation = s.fatherOccupation || null;
      } else if (s.motherName?.trim()) {
        name = s.motherName.trim();
        relationship = 'Mother';
        occupation = s.motherOccupation || null;
      }

      // The student's own contact number is the household's number when no
      // separate guardian mobile was captured.
      const phone = (s.guardianPhone || s.user?.phone || '').trim();
      const email = (s.guardianEmail || '').trim();
      if (!name && !phone) continue; // nothing worth listing

      const digits = phone.replace(/\D/g, '');
      const key = digits ? `p:${digits}` : `n:${name.toLowerCase()}`;
      const child = {
        id: s.id,
        rollNumber: s.rollNumber,
        user: s.user,
        section: s.section,
      };

      const row = derived.get(key);
      if (row) {
        row.students.push(child);
        // Fill in details a sibling's record happened to carry and this one didn't.
        row.user.firstName ||= name;
        row.user.phone ||= phone;
        row.user.email ||= email;
        row.occupation ||= occupation;
        row.relationship ||= relationship;
        continue;
      }
      derived.set(key, {
        id: `derived:${key}`,
        source: 'student',
        relationship,
        occupation: occupation || null,
        annualIncome: null,
        user: { id: null, firstName: name, lastName: '', email, phone, isActive: true },
        students: [child],
      });
    }

    const all = [
      ...parents.map((p) => ({ ...p, source: 'parent' })),
      ...derived.values(),
    ];

    // Search spans both sources, so it is applied after the merge rather than
    // in the Parent query.
    const q = search?.trim().toLowerCase();
    const filtered = q
      ? all.filter((r) =>
          [r.user?.firstName, r.user?.lastName, r.user?.email, r.user?.phone]
            .some((v) => String(v || '').toLowerCase().includes(q))
        )
      : all;

    const skip = (page - 1) * limit;
    return {
      data: filtered.slice(skip, skip + limit),
      pagination: { page, limit, total: filtered.length, pages: Math.ceil(filtered.length / limit) },
    };
  }

  async setActive(schoolId: string, parentId: string, isActive: boolean) {
    const parent = await db.parent.findFirst({ where: { id: parentId, schoolId } });
    if (!parent) {
      throw new Error('Parent not found');
    }
    await db.user.update({ where: { id: parent.userId }, data: { isActive } });
    return { message: `Parent ${isActive ? 'activated' : 'deactivated'}` };
  }

  async deleteParent(schoolId: string, parentId: string) {
    const parent = await db.parent.findFirst({ where: { id: parentId, schoolId } });
    if (!parent) {
      throw new Error('Parent not found');
    }
    // Removing the user cascades to the parent row
    await db.parent.delete({ where: { id: parentId } });
    await db.user.delete({ where: { id: parent.userId } });
    return { message: 'Parent deleted' };
  }

  private parentInclude() {
    return {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          isActive: true,
        },
      },
      students: {
        select: {
          id: true,
          rollNumber: true,
          user: { select: { firstName: true, lastName: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      },
    };
  }
}

export default new ParentService();
