import { db } from '@common/database/client';

const N = (v: any) => Number(v ?? 0);

export class PaymentsService {
  /** Resolve a student + their classId. */
  private async studentWithClass(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
      include: { user: { select: { firstName: true, lastName: true, phone: true } }, section: { include: { class: true } } },
    });
    if (!student) throw new Error('Student not found');
    return student;
  }

  /**
   * The fee ledger for a student: every enabled fee type configured for their
   * class with expected / extra / discount / paid / due. Expected for Monthly
   * fees = per-month amount × number of applicable months.
   */
  async getStudentLedger(schoolId: string, studentId: string) {
    const student = await this.studentWithClass(schoolId, studentId);
    const classId = student.sectionId ? student.section?.classId : undefined;

    const [structures, payments] = await Promise.all([
      classId
        ? db.classFeeStructure.findMany({ where: { schoolId, classId, enabled: true }, include: { feeType: true } })
        : Promise.resolve([]),
      db.feePayment.findMany({ where: { schoolId, studentId } }),
    ]);

    const sumBy = (feeTypeId: string, kind: string) =>
      payments.filter((p) => p.feeTypeId === feeTypeId && p.kind === kind).reduce((s, p) => s + N(p.amount), 0);

    const items = structures.map((s) => {
      const months = s.feeType.frequency === 'Monthly' ? Math.max(1, s.feeType.months.length) : 1;
      const base = N(s.amount) * months;
      const extra = sumBy(s.feeTypeId, 'EXTRA');
      const discount = sumBy(s.feeTypeId, 'DISCOUNT');
      const paid = sumBy(s.feeTypeId, 'PAID');
      const expected = base + extra - discount;
      return {
        feeTypeId: s.feeTypeId,
        name: s.feeType.name,
        frequency: s.feeType.frequency,
        months: s.feeType.months,
        perMonth: N(s.amount),
        expected,
        extra,
        discount,
        paid,
        due: Math.max(0, expected - paid),
      };
    });

    const totals = items.reduce(
      (t, i) => ({ expected: t.expected + i.expected, paid: t.paid + i.paid, due: t.due + i.due }),
      { expected: 0, paid: 0, due: 0 }
    );

    return {
      student: {
        id: student.id,
        name: `${student.user?.firstName ?? ''} ${student.user?.lastName ?? ''}`.trim(),
        rollNumber: student.rollNumber,
        phone: student.user?.phone,
        className: student.section?.class?.name,
        sectionName: student.section?.name,
      },
      items,
      totals,
    };
  }

  /** Record a payment (one receipt with one or more fee lines). */
  async collect(
    schoolId: string,
    data: { studentId: string; lines: any[]; mode?: string; createdBy?: string }
  ) {
    const { studentId, lines } = data;
    await this.studentWithClass(schoolId, studentId);
    if (!Array.isArray(lines) || lines.length === 0) throw new Error('No payment lines');

    const receiptNo = await this.nextReceiptNo(schoolId);
    const created = await db.$transaction(
      lines
        .filter((l) => N(l.amount) > 0 || N(l.discount) > 0 || N(l.fine) > 0)
        .map((l) =>
          db.feePayment.create({
            data: {
              schoolId,
              studentId,
              feeTypeId: l.feeTypeId || null,
              feeTypeName: l.name || null,
              month: l.month || null,
              amount: BigInt(Math.round(N(l.amount))),
              discount: BigInt(Math.round(N(l.discount))),
              fine: BigInt(Math.round(N(l.fine))),
              mode: data.mode || 'CASH',
              kind: 'PAID',
              receiptNo,
              createdBy: data.createdBy || null,
            },
          })
        )
    );
    return { receiptNo, lines: created.length };
  }

  async getHistory(schoolId: string, studentId: string) {
    return db.feePayment.findMany({ where: { schoolId, studentId }, orderBy: { paidDate: 'desc' } });
  }

  /** Per-student fee export for a class: one row per student with totals. */
  async exportClassFees(schoolId: string, classId: string) {
    const students = await db.student.findMany({
      where: { schoolId, deletedAt: null, section: { classId } },
      include: { user: { select: { firstName: true, lastName: true, phone: true } }, section: { include: { class: true } } },
      orderBy: { rollNumber: 'asc' },
    });
    const rows = [];
    for (const s of students) {
      const ledger = await this.getStudentLedger(schoolId, s.id);
      rows.push({
        rollNumber: s.rollNumber,
        name: ledger.student.name,
        class: `${s.section?.class?.name ?? ''}-${s.section?.name ?? ''}`,
        phone: s.user?.phone ?? '',
        expected: ledger.totals.expected,
        paid: ledger.totals.paid,
        due: ledger.totals.due,
        ...Object.fromEntries(ledger.items.map((i) => [i.name, i.due])),
      });
    }
    return rows;
  }

  // ── Bulk discount / extra (session-wide, class-wide, or specific students) ──
  async bulkApply(
    schoolId: string,
    kind: 'DISCOUNT' | 'EXTRA',
    data: { studentIds?: string[]; classId?: string; feeTypeId: string; amount: number; note?: string }
  ) {
    let studentIds = data.studentIds || [];
    if ((!studentIds || studentIds.length === 0) && data.classId) {
      const students = await db.student.findMany({
        where: { schoolId, deletedAt: null, section: { classId: data.classId } },
        select: { id: true },
      });
      studentIds = students.map((s) => s.id);
    }
    if (!studentIds.length) throw new Error('No students matched');
    if (!data.feeTypeId) throw new Error('Fee type is required');

    const feeType = await db.classFeeType.findFirst({ where: { id: data.feeTypeId, schoolId } });

    await db.$transaction(
      studentIds.map((studentId) =>
        db.feePayment.create({
          data: {
            schoolId,
            studentId,
            feeTypeId: data.feeTypeId,
            feeTypeName: feeType?.name || null,
            amount: BigInt(Math.round(N(data.amount))),
            kind,
            note: data.note || null,
          },
        })
      )
    );
    return { applied: studentIds.length, kind };
  }

  // ── Late fee rules ──────────────────────────────────────────────────────
  async listLateFeeRules(schoolId: string) {
    return db.lateFeeRule.findMany({ where: { schoolId, deletedAt: null }, orderBy: { createdAt: 'desc' } });
  }
  async createLateFeeRule(schoolId: string, data: any) {
    if (!data.name) throw new Error('Rule name is required');
    return db.lateFeeRule.create({
      data: {
        schoolId,
        name: data.name,
        session: data.session || null,
        applicableFeeType: data.applicableFeeType || null,
        lateFeeType: data.lateFeeType || null,
        lateFeeAmount: BigInt(Math.round(N(data.lateFeeAmount))),
        chargeAfterDueDays: Number(data.chargeAfterDueDays) || 0,
        startFromCurrentMonth: data.startFromCurrentMonth !== false,
        enabled: data.enabled !== false,
      },
    });
  }
  async updateLateFeeRule(schoolId: string, id: string, data: any) {
    const rule = await db.lateFeeRule.findFirst({ where: { id, schoolId } });
    if (!rule) throw new Error('Rule not found');
    return db.lateFeeRule.update({
      where: { id },
      data: {
        name: data.name ?? rule.name,
        session: data.session ?? rule.session,
        applicableFeeType: data.applicableFeeType ?? rule.applicableFeeType,
        lateFeeType: data.lateFeeType ?? rule.lateFeeType,
        lateFeeAmount: data.lateFeeAmount !== undefined ? BigInt(Math.round(N(data.lateFeeAmount))) : rule.lateFeeAmount,
        chargeAfterDueDays: data.chargeAfterDueDays !== undefined ? Number(data.chargeAfterDueDays) : rule.chargeAfterDueDays,
        startFromCurrentMonth: data.startFromCurrentMonth ?? rule.startFromCurrentMonth,
        enabled: data.enabled ?? rule.enabled,
      },
    });
  }
  async deleteLateFeeRule(schoolId: string, id: string) {
    const rule = await db.lateFeeRule.findFirst({ where: { id, schoolId } });
    if (!rule) throw new Error('Rule not found');
    await db.lateFeeRule.update({ where: { id }, data: { deletedAt: new Date() } });
    return { message: 'Rule deleted' };
  }

  private async nextReceiptNo(schoolId: string) {
    const year = new Date().getFullYear();
    const count = await db.feePayment.count({ where: { schoolId, receiptNo: { not: null } } });
    return `RCP-${year}-${String(count + 1).padStart(5, '0')}`;
  }
}

export default new PaymentsService();
