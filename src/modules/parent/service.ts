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

  async listParents(schoolId: string, page = 1, limit = 10, search?: string) {
    const skip = (page - 1) * limit;
    const where: any = { schoolId };

    if (search) {
      where.OR = [
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } },
        { user: { email: { contains: search, mode: 'insensitive' } } },
        { user: { phone: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [parents, total] = await Promise.all([
      db.parent.findMany({
        where,
        skip,
        take: limit,
        include: this.parentInclude(),
        orderBy: { createdAt: 'desc' },
      }),
      db.parent.count({ where }),
    ]);

    return { data: parents, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
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
