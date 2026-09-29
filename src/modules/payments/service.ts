import { db } from '@common/database/client';
import whatsappService from '../whatsapp/service';
import templateService from '../whatsapp/templateService';

const N = (v: any) => Number(v ?? 0);

/**
 * Synthetic fee-type id for the "brought forward from the previous class" line.
 * It is not a real ClassFeeType — it exists so the carried amount behaves like
 * any other ledger row: payments, discounts and extras against it are matched
 * by feeTypeId in exactly the same way.
 */
export const CARRIED_FORWARD_ID = 'CARRIED_FORWARD';
const CARRIED_FORWARD_NAME = 'Previous Dues (Carried Forward)';

/** Frozen dues brought in from the class the student was promoted out of. */
interface Carry { amount: number; month: string | null }

// Built-in receipt message used when no PAYMENT_RECEIVED template is set up.
const DEFAULT_RECEIPT_TEMPLATE = [
  '*{{school}}*',
  'Payment Receipt *{{receiptNo}}*',
  '',
  'Student: {{name}} ({{className}})',
  'Roll No: {{rollNumber}}',
  'Date: {{date}}',
  '',
  '{{lines}}',
  '',
  '*Total Paid: Rs. {{total}}*',
  '',
  'Thank you for the payment.',
].join('\n');

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
  private computeLedger(structures: any[], payments: any[], carry?: Carry) {
    const sumBy = (feeTypeId: string, kind: string) =>
      payments.filter((p) => p.feeTypeId === feeTypeId && p.kind === kind).reduce((s, p) => s + N(p.amount), 0);

    const items = structures.map((s) => {
      // `capped` means the month list was narrowed for THIS student (a promotion
      // start month or a left-date cutoff). An empty list then means genuinely
      // zero months to bill; the Math.max(1) floor is only for fee types that
      // were never configured with months at all.
      const months = ['Monthly', 'Quarterly'].includes(s.feeType.frequency)
        ? (s.capped ? s.feeType.months.length : Math.max(1, s.feeType.months.length))
        : 1;
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

    // Amount frozen at the last promotion. A fixed number — never re-priced
    // against the current class — shown at the top of the ledger.
    if (carry && carry.amount > 0) {
      const extra = sumBy(CARRIED_FORWARD_ID, 'EXTRA');
      const discount = sumBy(CARRIED_FORWARD_ID, 'DISCOUNT');
      const paid = sumBy(CARRIED_FORWARD_ID, 'PAID');
      const expected = carry.amount + extra - discount;
      items.unshift({
        feeTypeId: CARRIED_FORWARD_ID,
        name: CARRIED_FORWARD_NAME,
        frequency: 'One-time',
        months: carry.month ? [carry.month] : [],
        perMonth: carry.amount,
        expected,
        extra,
        discount,
        paid,
        due: Math.max(0, expected - paid),
      });
    }

    const totals = items.reduce(
      (t, i) => ({ expected: t.expected + i.expected, paid: t.paid + i.paid, due: t.due + i.due }),
      { expected: 0, paid: 0, due: 0 }
    );

    return { items, totals };
  }

  // ── Transport fee ──────────────────────────────────────────────────────────
  // A student's transport is billed exactly like a Monthly class fee: the route's
  // monthly fee × the months the student is enrolled for transport. We model it
  // as a synthetic "fee structure" so it flows through the SAME ledger /
  // installment / dues / demand-bill code as class fees — no parallel logic.
  // The synthetic feeTypeId is `TRANSPORT:<routeId>` so payments match by it.
  private buildTransportStructure(route: any, months: any): any | null {
    if (!route) return null;
    const ms = Array.isArray(months) ? months.filter(Boolean) : [];
    if (!ms.length) return null;
    return {
      feeTypeId: `TRANSPORT:${route.id}`,
      amount: route.fee,
      feeType: { name: `Transport (${route.name})`, frequency: 'Monthly', months: ms },
    };
  }

  /** Resolve ONE student's transport structure (looks the route up by name). */
  private async transportStructureForStudent(schoolId: string, student: any): Promise<any | null> {
    if (!student?.transportAllotted || !student?.transportRoute) return null;
    const route = await db.transportRoute.findFirst({ where: { schoolId, name: student.transportRoute, deletedAt: null } });
    return this.buildTransportStructure(route, student.transportMonths);
  }

  /**
   * Enabled class fee structures for the ledger, deduped to ONE row per fee type.
   * Now that a class can carry different amounts per session (academicYearId), a
   * plain classId fetch could return several rows for the same fee type and
   * double-count. We keep a single row per fee type, preferring the school's
   * ACTIVE session, then a legacy null-session row, then any other.
   */
  private async fetchClassStructures(schoolId: string, classId?: string, academicYearId?: string): Promise<any[]> {
    if (!classId) return [];
    const [rows, activeYear] = await Promise.all([
      db.classFeeStructure.findMany({ where: { schoolId, classId, enabled: true, feeType: { deletedAt: null } }, include: { feeType: true } }),
      db.academicYear.findFirst({ where: { schoolId, isActive: true }, select: { id: true } }),
    ]);
    // Prefer the requested session's rows; default to the active session.
    const activeId = academicYearId ?? activeYear?.id ?? null;
    const rank = (r: any) => (r.academicYearId === activeId ? 0 : r.academicYearId === null ? 1 : 2);
    const byType = new Map<string, any>();
    for (const r of rows) {
      const prev = byType.get(r.feeTypeId);
      if (!prev || rank(r) < rank(prev)) byType.set(r.feeTypeId, r);
    }
    return Array.from(byType.values());
  }

  /** Route lookup map (by name) for the batched per-class fee views. */
  private async routeMapByName(schoolId: string): Promise<Map<string, any>> {
    const routes = await db.transportRoute.findMany({ where: { schoolId, deletedAt: null } });
    return new Map(routes.map((r) => [r.name, r]));
  }

  /** Append a student's transport structure to the shared class structures. */
  private withTransport(structures: any[], routeMap: Map<string, any>, student: any): any[] {
    if (!student?.transportAllotted || !student?.transportRoute) return structures;
    const t = this.buildTransportStructure(routeMap.get(student.transportRoute), student.transportMonths);
    return t ? [...structures, t] : structures;
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
      this.fetchClassStructures(schoolId, classId),
      db.feePayment.findMany({ where: { schoolId, studentId } }),
    ]);

    const tStruct = await this.transportStructureForStudent(schoolId, student);
    const allStructures = this.capStructuresForStudent(tStruct ? [...structures, tStruct] : structures, student);
    const { items, totals } = this.computeLedger(allStructures, this.paymentsForStudent(payments, student), this.carryFor(student));

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

  /** Sortable index for a "Mon-YYYY" label (year*12 + monthIdx), or null. */
  private monthIndex(m?: string | null): number | null {
    if (!m) return null;
    const [mon, yr] = m.split('-');
    const idx = PaymentsService.MONTHS.indexOf(mon);
    if (idx < 0 || !yr) return null;
    return Number(yr) * 12 + idx;
  }

  /**
   * When a student has LEFT the school (isActive === false) with a billing
   * cutoff (`billedUntilMonth`), recurring (Monthly/Quarterly) fees are only
   * billed up to and INCLUDING that month — later months are dropped so no
   * further fee accrues. Session / One-time fees (and any fee whose months we
   * can't parse) are left untouched: they stay fully due so the admin can waive
   * them via a discount. Active students are returned unchanged.
   */
  private capStructuresForStudent(structures: any[], student: any): any[] {
    const toIdx = student && student.isActive === false ? this.monthIndex(student.billedUntilMonth) : null;
    // A mid-session promotion: months before this belonged to the previous
    // class and were settled into `carriedDue`, so the current class must not
    // charge for them.
    const fromIdx = this.monthIndex(student?.feeStartMonth);
    return this.capMonths(structures, fromIdx, toIdx);
  }

  /**
   * Drop payments whose month falls outside a billing window.
   *
   * computeLedger matches payments to a fee type by id alone, NOT by month. So
   * once a promotion moves a student, payments they made for the previous
   * class's months would still be credited against the new class's rows — while
   * already being netted off inside `carriedDue`. That is the same money twice.
   * Payments with no month (Session / One-time) are never month-bound and always
   * stay.
   */
  private paymentsInWindow(payments: any[], fromIdx: number | null, toIdx: number | null): any[] {
    if (fromIdx == null && toIdx == null) return payments;
    return payments.filter((p) => {
      const mi = this.monthIndex(p.month);
      if (mi == null) return true;
      if (fromIdx != null && mi < fromIdx) return false;
      if (toIdx != null && mi > toIdx) return false;
      return true;
    });
  }

  /** The payments that count for a student's CURRENT class. */
  private paymentsForStudent(payments: any[], student: any): any[] {
    return this.paymentsInWindow(payments, this.monthIndex(student?.feeStartMonth), null);
  }

  /** The frozen carry-forward line for a student, if any. */
  private carryFor(student: any): Carry {
    return { amount: N(student?.carriedDue), month: student?.feeStartMonth ?? null };
  }

  /**
   * Narrow each recurring structure's month list to the window
   * [fromIdx, toIdx] (either bound optional). Structures that are actually
   * narrowed are flagged `capped` so the ledger knows an empty month list means
   * "nothing to bill" rather than "not configured". Session / One-time fees and
   * unparseable months are left untouched.
   */
  private capMonths(structures: any[], fromIdx: number | null, toIdx: number | null): any[] {
    if (fromIdx == null && toIdx == null) return structures;
    return structures.map((s) => {
      const ft = s.feeType;
      if (!ft || !['Monthly', 'Quarterly'].includes(ft.frequency) || !Array.isArray(ft.months) || !ft.months.length) return s;
      const months = ft.months.filter((m: string) => {
        const mi = this.monthIndex(m);
        if (mi == null) return true;
        if (fromIdx != null && mi < fromIdx) return false;
        if (toIdx != null && mi > toIdx) return false;
        return true;
      });
      return { ...s, capped: true, feeType: { ...ft, months } };
    });
  }

  /**
   * Pure per-installment builder (no DB): one row per fee type × applicable
   * month (or "Only Once" for Session/One-time) + ad-hoc EXTRA charges, each
   * with total / paid / discount / due / status and a dueDate. Shared by the
   * single-student installments view and the batched month-scoped demand so
   * both stay consistent. `admissionDate` is the dueDate fallback for fees with
   * no month (Session / One-time / ad-hoc).
   */
  private buildInstallmentRows(structures: any[], payments: any[], admissionDate?: Date | null, carry?: Carry) {
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
        dueDate: this.parseMonth(month) || admissionDate || new Date(),
        previousDue: 0,
        totalAmount, paid, discount, due,
        status: due <= 0 && totalAmount > 0 ? 'Success' : 'Pending',
      });
    };

    // Fee types that are actually enabled for this class. `structures` is
    // already filtered to enabled rows, so this is the set of "live" fees.
    const enabledFeeTypeIds = new Set((structures as any[]).map((s) => s.feeTypeId));

    // Brought forward from the previous class — one row, not tied to a month.
    // Stamped with the promotion month so a payment against it is recorded for
    // that month — which is what keeps an earlier promotion's carried payments
    // out of a later promotion's window.
    if (carry && carry.amount > 0) {
      enabledFeeTypeIds.add(CARRIED_FORWARD_ID);
      pushRow(CARRIED_FORWARD_ID, CARRIED_FORWARD_NAME, 'One-time', carry.month, carry.amount);
    }

    for (const s of structures as any[]) {
      const ft = s.feeType;
      const recurring = ['Monthly', 'Quarterly'].includes(ft.frequency);
      // Every applicable month fell outside this student's billing window
      // (promoted in later, or left earlier) — nothing to charge at all.
      if (recurring && s.capped && !ft.months.length) continue;
      const monthLike = recurring && ft.months.length;
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
    return rows;
  }

  /**
   * What a student still owes for everything BEFORE `beforeMonth`, priced at
   * the class they are in right now. Called by Promote Student just before the
   * move, so the figure is frozen at the OLD class's rates and carried into the
   * new class as a fixed line instead of being re-priced.
   *
   * Anything already carried from an earlier promotion is included, so repeated
   * promotions accumulate rather than losing the older debt. Months from
   * `beforeMonth` onward are excluded — those are the new class's to charge.
   */
  async outstandingBefore(schoolId: string, studentId: string, beforeMonth: string): Promise<number> {
    const startIdx = this.monthIndex(beforeMonth);
    if (startIdx == null) throw new Error('Invalid promotion month');

    const student = await this.studentWithClass(schoolId, studentId);
    const classId = student.sectionId ? student.section?.classId : undefined;

    const [structures, payments] = await Promise.all([
      this.fetchClassStructures(schoolId, classId),
      db.feePayment.findMany({ where: { schoolId, studentId } }),
    ]);

    const tStruct = await this.transportStructureForStudent(schoolId, student);
    const all = tStruct ? [...structures, tStruct] : structures;

    // Only month-bound fees are carried. A Session / One-time fee has no month,
    // so "unpaid before June" is meaningless for it — and the new class charges
    // its own copy of that fee, so freezing it here would bill it twice.
    const recurring = all.filter((x: any) => ['Monthly', 'Quarterly'].includes(x.feeType?.frequency));

    // Lower bound: where billing in the CURRENT class began (null if the student
    // has been here all session). Upper bound: the month before the promotion.
    const fromIdx = this.monthIndex((student as any).feeStartMonth);
    if (fromIdx != null && fromIdx > startIdx - 1) {
      throw new Error('Promotion month must be after the previous promotion month');
    }

    const { totals } = this.computeLedger(
      this.capMonths(recurring, fromIdx, startIdx - 1),
      this.paymentsInWindow(payments, fromIdx, startIdx - 1),
      this.carryFor(student)
    );
    return totals.due;
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
      this.fetchClassStructures(schoolId, classId),
      db.feePayment.findMany({ where: { schoolId, studentId } }),
    ]);

    const tStruct = await this.transportStructureForStudent(schoolId, student);
    const allStructures = this.capStructuresForStudent(tStruct ? [...structures, tStruct] : structures, student);
    const rows = this.buildInstallmentRows(allStructures, this.paymentsForStudent(payments, student), (student as any).admissionDate, this.carryFor(student));
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
    // Auto-notify on WhatsApp when a PAYMENT_RECEIVED template is enabled.
    // Fire-and-forget: messaging problems must never fail the payment.
    void this.receiptVars(schoolId, receiptNo)
      .then(({ to, vars }) => templateService.sendEvent(schoolId, 'PAYMENT_RECEIVED', to, vars))
      .catch(() => { /* logged inside sendEvent */ });

    return { receiptNo, lines: created.length };
  }

  /** Placeholder values + recipient for a receipt's WhatsApp message. */
  private async receiptVars(schoolId: string, receiptNo: string) {
    const rows = await db.feePayment.findMany({ where: { schoolId, receiptNo, kind: 'PAID' } });
    if (!rows.length) throw new Error('Receipt not found');
    const [student, school] = await Promise.all([
      db.student.findFirst({
        where: { id: rows[0].studentId, schoolId },
        select: {
          rollNumber: true, fatherName: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      }),
      db.school.findUnique({ where: { id: schoolId }, select: { name: true } }),
    ]);
    const total = rows.reduce((s, r) => s + N(r.amount), 0);
    const lines = rows
      .map((r) => `- ${r.feeTypeName || 'Fee'}${r.month ? ` (${r.month})` : ''}: Rs. ${N(r.amount)}`)
      .join('\n');
    const d = rows[0].paidDate ?? rows[0].createdAt;
    return {
      to: student?.user?.phone || null,
      vars: {
        school: school?.name ?? '',
        receiptNo,
        name: `${student?.user?.firstName ?? ''} ${student?.user?.lastName ?? ''}`.trim(),
        fatherName: student?.fatherName ?? '',
        className: `${student?.section?.class?.name ?? ''}-${student?.section?.name ?? ''}`.replace(/^-|-$/g, ''),
        rollNumber: student?.rollNumber ?? '',
        date: d ? new Date(d).toLocaleDateString('en-GB') : '',
        total,
        lines,
      },
    };
  }

  /**
   * Send a receipt to the student's phone on WhatsApp (the button on the
   * payment pages). Uses the enabled PAYMENT_RECEIVED templates when present,
   * otherwise a built-in receipt message.
   */
  async sendReceiptWhatsApp(schoolId: string, receiptNo: string) {
    const { to, vars } = await this.receiptVars(schoolId, receiptNo);
    if (!to) throw new Error('This student has no phone number on record');
    const res = await templateService.sendEvent(schoolId, 'PAYMENT_RECEIVED', to, vars);
    if (res.sent === 0) {
      if (res.failed > 0) throw new Error('WhatsApp send failed — check the WhatsApp connection');
      await whatsappService.sendText(schoolId, to, templateService.render(DEFAULT_RECEIPT_TEMPLATE, vars));
    }
    return { to, receiptNo };
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
          isActive: true, billedUntilMonth: true,
          transportAllotted: true, transportRoute: true, transportMonths: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
        orderBy: { rollNumber: 'asc' },
      }),
      this.fetchClassStructures(schoolId, classId),
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
    const routeMap = await this.routeMapByName(schoolId);

    return students.map((s) => {
      const { items, totals } = this.computeLedger(this.capStructuresForStudent(this.withTransport(structures, routeMap, s), s), this.paymentsForStudent(byStudent.get(s.id) || [], s), this.carryFor(s));
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
   * Class-wise fee totals for the whole school: per class, the summed
   * expected / collected / pending across its students (same ledger math as
   * the per-student views). `academicYearId` picks which session's fee
   * structure drives the expected amounts.
   */
  async classFeeSummary(schoolId: string, academicYearId?: string) {
    const [classes, students, payments, routeMap] = await Promise.all([
      db.class.findMany({ where: { schoolId, deletedAt: null }, select: { id: true, name: true } }),
      db.student.findMany({
        where: { schoolId, deletedAt: null },
        select: {
          id: true, isActive: true, billedUntilMonth: true,
          transportAllotted: true, transportRoute: true, transportMonths: true,
          section: { select: { classId: true } },
        },
      }),
      db.feePayment.findMany({ where: { schoolId } }),
      this.routeMapByName(schoolId),
    ]);

    const byStudent = new Map<string, any[]>();
    for (const p of payments) {
      const list = byStudent.get(p.studentId) || [];
      list.push(p);
      byStudent.set(p.studentId, list);
    }

    const rows = [];
    for (const cls of classes) {
      const clsStudents = students.filter((s) => s.section?.classId === cls.id);
      const structures = await this.fetchClassStructures(schoolId, cls.id, academicYearId);
      let total = 0, collected = 0, pending = 0;
      for (const s of clsStudents) {
        const { totals } = this.computeLedger(this.capStructuresForStudent(this.withTransport(structures, routeMap, s), s), this.paymentsForStudent(byStudent.get(s.id) || [], s), this.carryFor(s));
        total += totals.expected;
        collected += totals.paid;
        pending += totals.due;
      }
      rows.push({ classId: cls.id, className: cls.name, students: clsStudents.length, total, collected, pending });
    }
    return rows;
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
          id: true, rollNumber: true, registrationNo: true, fatherName: true, motherName: true,
          isActive: true, billedUntilMonth: true,
          transportAllotted: true, transportRoute: true, transportMonths: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
        orderBy: { rollNumber: 'asc' },
      }),
      this.fetchClassStructures(schoolId, classId),
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
    const routeMap = await this.routeMapByName(schoolId);

    const now = new Date();
    const curMonth = `${PaymentsService.MONTHS[now.getMonth()]}-${now.getFullYear()}`;

    return students.map((s) => {
      const pmts = byStudent.get(s.id) || [];
      const allStructures = this.capStructuresForStudent(this.withTransport(structures, routeMap, s), s);
      const { totals } = this.computeLedger(allStructures, this.paymentsForStudent(pmts, s), this.carryFor(s));

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
      for (const st of allStructures as any[]) {
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
        fatherName: s.fatherName ?? '',
        motherName: s.motherName ?? '',
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

  /**
   * Month-scoped class demand: for the selected month, split each student's
   * outstanding dues into `previousDue` (everything due BEFORE the selected
   * month) and `currentDue` (fees actually configured for the selected month).
   * `lines` itemises the current month's fees for the printable demand bill.
   *
   * When no month is selected the whole outstanding ledger is treated as
   * "current" (legacy behaviour). This is what makes month selection meaningful
   * — a month with no configured fee yields currentDue = 0 instead of repeating
   * the same total for every month.
   */
  async classMonthlyDues(schoolId: string, classId: string, month?: string) {
    const [students, structures] = await Promise.all([
      db.student.findMany({
        where: { schoolId, deletedAt: null, section: { classId } },
        select: {
          id: true, rollNumber: true, registrationNo: true, fatherName: true, admissionDate: true,
          isActive: true, billedUntilMonth: true,
          transportAllotted: true, transportRoute: true, transportMonths: true,
          user: { select: { firstName: true, lastName: true, phone: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
        orderBy: { rollNumber: 'asc' },
      }),
      this.fetchClassStructures(schoolId, classId),
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
    const routeMap = await this.routeMapByName(schoolId);

    // Window for the selected month [monthStart, monthEnd]. A row is "current"
    // if its installment month matches the selection, or (for monthless fees)
    // its dueDate falls inside the window; anything due earlier is "previous".
    const md = this.parseMonth(month);
    const monthStart = md ? new Date(md.getFullYear(), md.getMonth(), 1) : null;
    const monthEnd = md ? new Date(md.getFullYear(), md.getMonth() + 1, 0, 23, 59, 59, 999) : null;

    return students.map((s) => {
      const rows = this.buildInstallmentRows(this.capStructuresForStudent(this.withTransport(structures, routeMap, s), s), this.paymentsForStudent(byStudent.get(s.id) || [], s), (s as any).admissionDate, this.carryFor(s));
      let previousDue = 0;
      let currentDue = 0;
      // Fee / discount / paid behind the previous-due figure, so the demand bill
      // can show the same Fee | Discount | Due | Paid breakdown for that line.
      const previous = { fee: 0, discount: 0, paid: 0 };
      const lines: { name: string; month: string; amount: number; fee: number; discount: number; paid: number }[] = [];

      for (const r of rows) {
        if (r.due <= 0) continue;
        let bucket: 'previous' | 'current' | 'future';
        if (!month || !monthStart) {
          bucket = 'current'; // no month picked → legacy "all outstanding"
        } else if (r.month === month) {
          bucket = 'current';
        } else {
          const d = new Date(r.dueDate);
          if (d < monthStart) bucket = 'previous';
          else if (monthEnd && d <= monthEnd) bucket = 'current';
          else bucket = 'future';
        }
        if (bucket === 'current') {
          currentDue += r.due;
          lines.push({ name: r.name, month: r.monthLabel, amount: r.due, fee: r.totalAmount, discount: r.discount, paid: r.paid });
        } else if (bucket === 'previous') {
          previousDue += r.due;
          previous.fee += r.totalAmount;
          previous.discount += r.discount;
          previous.paid += r.paid;
        }
      }

      const totalDue = previousDue + currentDue;
      return {
        studentId: s.id,
        rollNumber: s.rollNumber,
        regId: s.registrationNo ?? '',
        name: `${s.user?.firstName ?? ''} ${s.user?.lastName ?? ''}`.trim(),
        fatherName: s.fatherName ?? '',
        class: `${s.section?.class?.name ?? ''}-${s.section?.name ?? ''}`,
        section: s.section?.name ?? '',
        phone: s.user?.phone ?? '',
        month: month || '',
        previousDue,
        previousFee: previous.fee,
        previousDiscount: previous.discount,
        previousPaid: previous.paid,
        currentDue,
        totalDue,
        due: totalDue, // back-compat: existing UIs read `due` as the demand total
        lines,
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
