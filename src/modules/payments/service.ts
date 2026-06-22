import { db } from '@common/database/client';

const N = (v: any) => Number(v ?? 0);

export class PaymentsService {
  /** Resolve a student + their classId. */
  private async studentWithClass(schoolId: string, studentId: string) {
    const student = await db.student.findFirst({
      where: { id: studentId, schoolId },
      include: { user: { select: { firstName: true, lastName: true, phone: true, email: true } }, section: { include: { class: true } } },
    });
    if (!student) throw new Error('Student not found');
    return student;
  }

  /**
   * Pure ledger math (no DB): given a class's fee structures and ONE student's
   * payments, produce the per-fee-type items + totals. Shared by the single
   * student ledger and the batched class export so both stay consistent.
   */
  private computeLedger(structures: any[], payments: any[]) {
    const sumBy = (feeTypeId: string, kind: string) =>
      payments.filter((p) => p.feeTypeId === feeTypeId && p.kind === kind).reduce((s, p) => s + N(p.amount), 0);

    const items = structures.map((s) => {
      const months = ['Monthly', 'Quarterly'].includes(s.feeType.frequency) ? Math.max(1, s.feeType.months.length) : 1;
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

    return { items, totals };
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
        ? db.classFeeStructure.findMany({ where: { schoolId, classId, enabled: true, feeType: { deletedAt: null } }, include: { feeType: true } })
        : Promise.resolve([]),
      db.feePayment.findMany({ where: { schoolId, studentId } }),
    ]);

    const { items, totals } = this.computeLedger(structures, payments);

    return {
      student: {
        id: student.id,
        name: `${student.user?.firstName ?? ''} ${student.user?.lastName ?? ''}`.trim(),
        rollNumber: student.rollNumber,
        phone: student.user?.phone,
        email: student.user?.email,
        className: student.section?.class?.name,
        sectionName: student.section?.name,
        fatherName: student.fatherName,
        registrationNo: student.registrationNo,
        photo: student.photo,
        remarks: student.remarks,
      },
      items,
      totals,
    };
  }

  private static MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  private parseMonth(m?: string | null): Date | null {
    if (!m) return null;
    const [mon, yr] = m.split('-');
    const idx = PaymentsService.MONTHS.indexOf(mon);
    if (idx < 0 || !yr) return null;
    return new Date(Number(yr), idx, 2);
  }

  /**
   * Per-installment ledger: one row per fee type × applicable month (or "Only
   * Once" for Session/One-time), each with total / paid / discount / due / status.
   * Payments and adjustments are matched by (feeTypeId, month).
   */
  async getInstallments(schoolId: string, studentId: string) {
    const student = await this.studentWithClass(schoolId, studentId);
    const classId = student.section?.classId;
    const [structures, payments] = await Promise.all([
      classId
        ? db.classFeeStructure.findMany({ where: { schoolId, classId, enabled: true, feeType: { deletedAt: null } }, include: { feeType: true } })
        : Promise.resolve([]),
      db.feePayment.findMany({ where: { schoolId, studentId } }),
    ]);

    const agg = (feeTypeId: string | null, month: string | null, kind: string, field: 'amount' | 'discount' = 'amount') =>
      payments
        .filter((p) => p.feeTypeId === feeTypeId && (p.month ?? null) === (month ?? null) && p.kind === kind)
        .reduce((s, p) => s + N((p as any)[field]), 0);

    const rows: any[] = [];
    const seen = new Set<string>();
    const pushRow = (feeTypeId: string | null, name: string, frequency: string, month: string | null, perMonth: number) => {
      const key = `${feeTypeId}|${month ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);
      const paid = agg(feeTypeId, month, 'PAID');
      const discount = agg(feeTypeId, month, 'DISCOUNT') + agg(feeTypeId, month, 'PAID', 'discount');
      const extra = agg(feeTypeId, month, 'EXTRA');
      const totalAmount = perMonth + extra;
      const due = Math.max(0, totalAmount - discount - paid);
      rows.push({
        feeTypeId, name, frequency,
        month, monthLabel: month || 'Only Once',
        dueDate: this.parseMonth(month) || (student as any).admissionDate || new Date(),
        previousDue: 0,
        totalAmount, paid, discount, due,
        status: due <= 0 && totalAmount > 0 ? 'Success' : 'Pending',
      });
    };

    // Fee types that are actually enabled for this class. `structures` is
    // already filtered to enabled rows, so this is the set of "live" fees.
    const enabledFeeTypeIds = new Set((structures as any[]).map((s) => s.feeTypeId));

    for (const s of structures as any[]) {
      const ft = s.feeType;
      const monthLike = ['Monthly', 'Quarterly'].includes(ft.frequency) && ft.months.length;
      const keys = monthLike ? ft.months : [null];
      for (const m of keys) pushRow(s.feeTypeId, ft.name, ft.frequency, m, N(s.amount));
    }
    // Extra/ad-hoc charges (e.g. Add Fee Payment) not tied to a structure row.
    // Skip charges bound to a fee type that is NOT enabled for this class so
    // that disabling a fee in Manage Class Fee also drops its stray charges —
    // this keeps the installments view consistent with the ledger. Truly
    // ad-hoc charges (no feeTypeId) always show.
    for (const p of payments.filter((x) => x.kind === 'EXTRA')) {
      if (p.feeTypeId && !enabledFeeTypeIds.has(p.feeTypeId)) continue;
      pushRow(p.feeTypeId, p.feeTypeName || 'Additional Fee', 'Other', p.month ?? null, 0);
    }

    rows.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
    const totals = rows.reduce(
      (t, r) => ({ total: t.total + r.totalAmount, paid: t.paid + r.paid, discount: t.discount + r.discount, due: t.due + r.due }),
      { total: 0, paid: 0, discount: 0, due: 0 }
    );

    return {
      student: {
        id: student.id,
        name: `${student.user?.firstName ?? ''} ${student.user?.lastName ?? ''}`.trim(),
        rollNumber: student.rollNumber,
        phone: student.user?.phone,
        email: student.user?.email,
        className: student.section?.class?.name,
        sectionName: student.section?.name,
        fatherName: (student as any).fatherName,
        registrationNo: (student as any).registrationNo,
        photo: (student as any).photo,
        remarks: (student as any).remarks,
      },
      rows,
      totals,
    };
  }

  /** Apply a per-installment DISCOUNT or EXTRA charge (matched by feeTypeId + month). */
  async adjustInstallment(
    schoolId: string,
    data: { studentId: string; feeTypeId?: string; month?: string; kind: 'DISCOUNT' | 'EXTRA'; amount: number; note?: string }
  ) {
    await this.studentWithClass(schoolId, data.studentId);
    if (!data.feeTypeId) throw new Error('Fee type is required');
    const amount = N(data.amount);
    const feeType = await db.classFeeType.findFirst({ where: { id: data.feeTypeId, schoolId } });

    // DISCOUNT is a "set" operation so it can be edited: replace any prior
    // standalone discount on this installment with the new value. An amount of 0
    // clears the discount entirely. (PAID-row discounts are left untouched.)
    if (data.kind === 'DISCOUNT') {
      if (amount < 0) throw new Error('Discount must be zero or greater');
      await db.feePayment.deleteMany({
        where: { schoolId, studentId: data.studentId, feeTypeId: data.feeTypeId, month: data.month || null, kind: 'DISCOUNT' },
      });
      if (amount > 0) {
        await db.feePayment.create({
          data: {
            schoolId,
            studentId: data.studentId,
            feeTypeId: data.feeTypeId,
            feeTypeName: feeType?.name || null,
            month: data.month || null,
            amount: BigInt(Math.round(amount)),
            kind: 'DISCOUNT',
            note: data.note || null,
          },
        });
      }
      return { ok: true };
    }

    if (!(amount > 0)) throw new Error('Amount must be greater than zero');
    await db.feePayment.create({
      data: {
        schoolId,
        studentId: data.studentId,
        feeTypeId: data.feeTypeId,
        feeTypeName: feeType?.name || null,
        month: data.month || null,
        amount: BigInt(Math.round(amount)),
        kind: data.kind,
        note: data.note || null,
      },
    });
    return { ok: true };
  }

  /** Delete the PAID rows of a single installment (revert that month's payment). */
  async deleteInstallmentPayments(schoolId: string, data: { studentId: string; feeTypeId?: string; month?: string }) {
    const res = await db.feePayment.deleteMany({
      where: { schoolId, studentId: data.studentId, feeTypeId: data.feeTypeId || null, month: data.month || null, kind: 'PAID' },
    });
    return { deleted: res.count };
  }

  /** Revert an entire receipt (delete all payment rows sharing the receipt no). */
  async revertReceipt(schoolId: string, receiptNo: string) {
    if (!receiptNo) throw new Error('Receipt number is required');
    const res = await db.feePayment.deleteMany({ where: { schoolId, receiptNo } });
    if (res.count === 0) throw new Error('Receipt not found');
    return { deleted: res.count };
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
              note: l.note || (data as any).note || null,
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
    // Every student in this class shares ONE fee structure, so fetch it once;
    // fetch ALL of their payments in a single query and group in memory. This
    // turns a per-student N+1 (3 queries each) into 3 queries total.
    const [students, structures] = await Promise.all([
      db.student.findMany({
        where: { schoolId, deletedAt: null, section: { classId } },
        select: {
          id: true, rollNumber: true, registrationNo: true, fatherName: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
        orderBy: { rollNumber: 'asc' },
      }),
      db.classFeeStructure.findMany({ where: { schoolId, classId, enabled: true, feeType: { deletedAt: null } }, include: { feeType: true } }),
    ]);

    const studentIds = students.map((s) => s.id);
    const allPayments = studentIds.length
      ? await db.feePayment.findMany({ where: { schoolId, studentId: { in: studentIds } } })
      : [];

    // Bucket payments by student for O(1) lookup during the ledger computation.
    const byStudent = new Map<string, any[]>();
    for (const p of allPayments) {
      const list = byStudent.get(p.studentId) || [];
      list.push(p);
      byStudent.set(p.studentId, list);
    }

    return students.map((s) => {
      const { items, totals } = this.computeLedger(structures, byStudent.get(s.id) || []);
      return {
        studentId: s.id,
        rollNumber: s.rollNumber,
        regId: s.registrationNo ?? '',
        name: `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim(),
        fatherName: s.fatherName ?? '',
        class: `${s.section?.class?.name ?? ''}-${s.section?.name ?? ''}`,
        phone: s.user?.phone ?? '',
        expected: totals.expected,
        paid: totals.paid,
        due: totals.due,
        ...Object.fromEntries(items.map((i) => [i.name, i.due])),
      };
    });
  }

  /**
   * Per-student fee summary for a class, oriented around the monthly fee cycle:
   * last payment (date + amount), total fee, total left, and whether the CURRENT
   * calendar month's installment is paid. Used by the Student Fee Details page.
   */
  async feeDetails(schoolId: string, classId: string) {
    const [students, structures] = await Promise.all([
      db.student.findMany({
        where: { schoolId, deletedAt: null, section: { classId } },
        select: {
          id: true, rollNumber: true, registrationNo: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
        orderBy: { rollNumber: 'asc' },
      }),
      db.classFeeStructure.findMany({ where: { schoolId, classId, enabled: true, feeType: { deletedAt: null } }, include: { feeType: true } }),
    ]);

    const studentIds = students.map((s) => s.id);
    const allPayments = studentIds.length
      ? await db.feePayment.findMany({ where: { schoolId, studentId: { in: studentIds } } })
      : [];
    const byStudent = new Map<string, any[]>();
    for (const p of allPayments) {
      const list = byStudent.get(p.studentId) || [];
      list.push(p);
      byStudent.set(p.studentId, list);
    }

    const now = new Date();
    const curMonth = `${PaymentsService.MONTHS[now.getMonth()]}-${now.getFullYear()}`;

    return students.map((s) => {
      const pmts = byStudent.get(s.id) || [];
      const { totals } = this.computeLedger(structures, pmts);

      // Last payment: latest receipt (grouped by receiptNo) by paid date.
      const recs = new Map<string, { total: number; date: Date }>();
      for (const p of pmts) {
        if (p.kind !== 'PAID') continue;
        const key = p.receiptNo || p.id;
        const r = recs.get(key) || { total: 0, date: p.paidDate ?? p.createdAt };
        r.total += N(p.amount);
        const d = p.paidDate ?? p.createdAt;
        if (d && new Date(d) > new Date(r.date)) r.date = d;
        recs.set(key, r);
      }
      let lastPaidDate: Date | null = null;
      let lastPaidAmount = 0;
      for (const r of recs.values()) {
        if (!lastPaidDate || new Date(r.date) > new Date(lastPaidDate)) { lastPaidDate = r.date; lastPaidAmount = r.total; }
      }

      // Current-month status across monthly/quarterly fee types that bill this month.
      const aggM = (feeTypeId: string, kind: string, field: 'amount' | 'discount' = 'amount') =>
        pmts.filter((p) => p.feeTypeId === feeTypeId && (p.month ?? null) === curMonth && p.kind === kind)
          .reduce((acc, p) => acc + N((p as any)[field]), 0);
      let curApplicable = false;
      let curDue = 0;
      for (const st of structures as any[]) {
        const ft = st.feeType;
        const monthLike = ['Monthly', 'Quarterly'].includes(ft.frequency) && ft.months.length;
        if (!monthLike || !ft.months.includes(curMonth)) continue;
        curApplicable = true;
        const perMonth = N(st.amount);
        const paidM = aggM(st.feeTypeId, 'PAID');
        const discM = aggM(st.feeTypeId, 'DISCOUNT') + aggM(st.feeTypeId, 'PAID', 'discount');
        const extraM = aggM(st.feeTypeId, 'EXTRA');
        curDue += Math.max(0, perMonth + extraM - discM - paidM);
      }
      const currentMonthStatus = !curApplicable ? 'N/A' : curDue <= 0 ? 'Paid' : 'Pending';

      return {
        studentId: s.id,
        rollNumber: s.rollNumber,
        regId: s.registrationNo ?? '',
        name: `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim(),
        class: `${s.section?.class?.name ?? ''}-${s.section?.name ?? ''}`,
        phone: s.user?.phone ?? '',
        lastPaidDate,
        lastPaidAmount,
        totalFee: totals.expected,
        totalLeft: totals.due,
        currentMonth: curMonth,
        currentMonthStatus,
      };
    });
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
