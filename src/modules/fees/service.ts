import { db } from '@common/database/client';
import { CreateFeeGroupRequest, CreateFeeTypeRequest, CreateFeeStructureRequest, CollectFeeRequest } from './types';

export class FeesService {
  /**
   * Create fee group
   */
  async createFeeGroup(schoolId: string, data: CreateFeeGroupRequest) {
    const { name } = data;

    const existing = await db.feeGroup.findFirst({
      where: { schoolId, name },
    });

    if (existing) {
      throw new Error('Fee group already exists');
    }

    const group = await db.feeGroup.create({
      data: {
        schoolId,
        name,
        description: data.description,
      },
    });

    return group;
  }

  /**
   * List fee groups
   */
  async listFeeGroups(schoolId: string) {
    const groups = await db.feeGroup.findMany({
      where: { schoolId },
      include: {
        feeTypes: true,
        fees: {
          select: {
            id: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return groups;
  }

  /**
   * Create fee type
   */
  async createFeeType(schoolId: string, data: CreateFeeTypeRequest) {
    const { groupId, name } = data;

    const group = await db.feeGroup.findFirst({
      where: { schoolId, id: groupId },
    });

    if (!group) {
      throw new Error('Fee group not found');
    }

    const existing = await db.feeType.findFirst({
      where: { schoolId, name },
    });

    if (existing) {
      throw new Error('Fee type already exists');
    }

    const feeType = await db.feeType.create({
      data: {
        schoolId,
        groupId,
        name,
        amount: BigInt(data.amount),
        isOptional: data.isOptional || false,
      },
    });

    return feeType;
  }

  /**
   * List fee types
   */
  async listFeeTypes(schoolId: string, groupId?: string) {
    const where: any = { schoolId };
    if (groupId) {
      where.groupId = groupId;
    }

    const types = await db.feeType.findMany({
      where,
      include: {
        group: true,
      },
      orderBy: { name: 'asc' },
    });

    return types;
  }

  /**
   * Create fee structure (allocate to section)
   */
  async createFeeStructure(schoolId: string, data: CreateFeeStructureRequest) {
    const { sectionId, groupId, dueDate } = data;

    const section = await db.section.findFirst({
      where: { id: sectionId, schoolId },
    });

    if (!section) {
      throw new Error('Section not found');
    }

    const group = await db.feeGroup.findFirst({
      where: { schoolId, id: groupId },
    });

    if (!group) {
      throw new Error('Fee group not found');
    }

    const due = new Date(dueDate as any); // accept date-only strings from the UI
    if (isNaN(due.getTime())) {
      throw new Error('A valid due date is required');
    }

    const fee = await db.fee.create({
      data: {
        schoolId,
        sectionId,
        groupId,
        dueDate: due,
        fine: BigInt(data.fine || 0),
      },
      include: {
        group: {
          include: {
            feeTypes: true,
          },
        },
      },
    });

    return fee;
  }

  /**
   * List fees for section
   */
  async listFees(schoolId: string, sectionId?: string) {
    const where: any = { schoolId };
    if (sectionId) {
      where.sectionId = sectionId;
    }

    const fees = await db.fee.findMany({
      where,
      include: {
        group: {
          include: {
            feeTypes: true,
          },
        },
        collections: {
          select: {
            id: true,
            status: true,
          },
        },
      },
      orderBy: { dueDate: 'desc' },
    });

    return fees;
  }

  /**
   * Collect fee
   */
  async collectFee(schoolId: string, data: CollectFeeRequest) {
    const { studentId, feeId, amount } = data;

    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const fee = await db.fee.findFirst({
      where: { schoolId, id: feeId },
    });

    if (!fee) {
      throw new Error('Fee not found');
    }

    const receiptNo = `RCP-${Date.now()}`;

    const collection = await db.feeCollection.create({
      data: {
        schoolId,
        studentId,
        feeId,
        amount: BigInt(amount),
        paidDate: new Date(),
        status: 'COMPLETED',
        receiptNo,
        remarks: data.remarks,
      },
      include: {
        student: {
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
        },
      },
    });

    return collection;
  }

  /**
   * Get student dues
   */
  async getStudentDues(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
    });

    if (!student) {
      throw new Error('Student not found');
    }

    const dues = await db.feeCollection.findMany({
      where: {
        schoolId,
        studentId,
        status: { in: ['PENDING', 'FAILED'] },
      },
      include: {
        fee: {
          select: {
            id: true,
            dueDate: true,
            fine: true,
            group: {
              select: {
                name: true,
                feeTypes: true,
              },
            },
          },
        },
      },
      orderBy: { fee: { dueDate: 'desc' } },
    });

    return dues;
  }

  /**
   * Get fee collection report
   */
  async getFeeCollectionReport(schoolId: string, startDate: Date, endDate: Date, sectionId?: string) {
    const where: any = {
      schoolId,
      paidDate: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (sectionId) {
      const students = await db.student.findMany({
        where: { sectionId, schoolId },
        select: { id: true },
      });

      where.studentId = { in: students.map(s => s.id) };
    }

    const collections = await db.feeCollection.findMany({
      where,
      include: {
        student: {
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
        },
        fee: {
          select: {
            group: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: { paidDate: 'desc' },
    });

    const totalCollected = collections
      .filter(c => c.status === 'COMPLETED')
      .reduce((sum, c) => sum + Number(c.amount), 0);

    return {
      collections,
      totalCollected,
      count: collections.length,
    };
  }

  /**
   * Calculate fine based on due date
   */
  async calculateFine(feeId: string, currentDate: Date = new Date()) {
    const fee = await db.fee.findUnique({
      where: { id: feeId },
    });

    if (!fee) {
      throw new Error('Fee not found');
    }

    if (currentDate <= fee.dueDate) {
      return 0;
    }

    const daysLate = Math.ceil((currentDate.getTime() - fee.dueDate.getTime()) / (1000 * 60 * 60 * 24));
    const finePerDay = Number(fee.fine) / 30; // Assume monthly fine
    const totalFine = Math.ceil(finePerDay * daysLate);

    return totalFine;
  }

  /**
   * Get pending dues
   */
  async getPendingDues(schoolId: string, page: number = 1, limit: number = 10) {
    const skip = (page - 1) * limit;

    const [dues, total] = await Promise.all([
      db.feeCollection.findMany({
        where: {
          schoolId,
          status: { in: ['PENDING', 'FAILED'] },
        },
        skip,
        take: limit,
        include: {
          student: {
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
          },
          fee: {
            select: {
              dueDate: true,
              group: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: { fee: { dueDate: 'asc' } },
      }),
      db.feeCollection.count({
        where: {
          schoolId,
          status: { in: ['PENDING', 'FAILED'] },
        },
      }),
    ]);

    return {
      data: dues,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Generate receipt number
   */
  generateReceiptNumber(): string {
    return `RCP-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  }
}

export default new FeesService();
