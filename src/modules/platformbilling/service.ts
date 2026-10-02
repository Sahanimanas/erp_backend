/**
 * Platform billing — the ERP vendor's own payment QR, and the payments schools
 * report against it.
 *
 * Two deliberate choices worth knowing before changing anything here:
 *
 * 1. The QR is a SINGLETON row (id "singleton"). There is one vendor, so a
 *    settings table with many rows would only create ambiguity about which QR
 *    is the live one.
 *
 * 2. A PlatformPayment is a *claim*, not a receipt. Nothing is checked against
 *    a bank, so a row means "the school says it paid". It stays REPORTED until
 *    a human confirms it out of band and flips it to VERIFIED.
 */
import { db } from '@common/database/client';

const SINGLETON = 'singleton';

/** Statuses a payment claim may hold. Anything else is rejected on write. */
export const PAYMENT_STATUSES = ['REPORTED', 'VERIFIED', 'REJECTED'] as const;
const METHODS = ['UPI', 'BANK', 'CASH', 'CHEQUE'];

const toAmount = (v: unknown): bigint => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error('Amount must be a positive number');
  return BigInt(Math.round(n));
};

/**
 * Add whole months, clamping the day so 31 Jan + 1 month lands on 28/29 Feb
 * rather than rolling into March the way a naive setMonth would.
 */
const addMonths = (from: Date, months: number): Date => {
  const d = new Date(from);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return d;
};

const toDate = (v: unknown): Date => {
  if (!v) return new Date();
  const d = new Date(v as string);
  if (isNaN(d.getTime())) throw new Error('Invalid payment date');
  return d;
};

export class PlatformBillingService {
  /**
   * The company QR. Returns an empty shell rather than null when the vendor has
   * not uploaded one yet, so every client renders the same shape and only has
   * to check `qrImage`.
   */
  async getQr() {
    const row = await db.platformQr.findUnique({ where: { id: SINGLETON } });
    return (
      row ?? {
        id: SINGLETON,
        qrImage: null,
        upiId: null,
        payeeName: null,
        note: null,
        updatedBy: null,
        updatedAt: null,
        createdAt: null,
      }
    );
  }

  /** Upsert the one QR row. Super-admin only — enforced at the route. */
  async saveQr(
    data: { qrImage?: string | null; upiId?: string | null; payeeName?: string | null; note?: string | null },
    updatedBy?: string
  ) {
    // Only fields the caller actually sent are written, so a partial save (just
    // the note, say) cannot blank out the QR image.
    const patch: any = { updatedBy: updatedBy ?? null };
    for (const k of ['qrImage', 'upiId', 'payeeName', 'note'] as const) {
      if (data[k] !== undefined) patch[k] = data[k] || null;
    }

    return db.platformQr.upsert({
      where: { id: SINGLETON },
      update: patch,
      create: { id: SINGLETON, ...patch },
    });
  }

  /**
   * A school records a payment it has made to the vendor. `schoolId` comes from
   * the caller's token, never from the body — otherwise one school could file
   * payments against another.
   */
  async reportPayment(
    schoolId: string,
    createdBy: string | undefined,
    data: {
      amount?: unknown;
      reference?: string;
      method?: string;
      paidDate?: string;
      screenshot?: string;
      note?: string;
    }
  ) {
    const amount = toAmount(data.amount);
    if (amount <= 0n) throw new Error('Amount must be greater than zero');

    const method = (data.method || 'UPI').toUpperCase();
    if (!METHODS.includes(method)) throw new Error(`Method must be one of ${METHODS.join(', ')}`);

    return db.platformPayment.create({
      data: {
        schoolId,
        amount,
        reference: data.reference?.trim() || null,
        method,
        paidDate: toDate(data.paidDate),
        screenshot: data.screenshot || null,
        note: data.note?.trim() || null,
        status: 'REPORTED',
        createdBy: createdBy ?? null,
      },
    });
  }

  /**
   * Payment claims, newest first. `schoolId` is a hard filter, not a hint: the
   * route passes the caller's own school for everyone except a super admin, so
   * scoping cannot be bypassed by omitting a query param.
   */
  async listPayments(filter: { schoolId?: string; status?: string; from?: string; to?: string } = {}) {
    const where: any = {};
    if (filter.schoolId) where.schoolId = filter.schoolId;
    if (filter.status) where.status = filter.status.toUpperCase();
    if (filter.from || filter.to) {
      where.paidDate = {};
      if (filter.from) where.paidDate.gte = toDate(filter.from);
      if (filter.to) {
        const t = toDate(filter.to);
        t.setHours(23, 59, 59, 999);
        where.paidDate.lte = t;
      }
    }

    const rows = await db.platformPayment.findMany({ where, orderBy: { paidDate: 'desc' }, take: 500 });

    // PlatformPayment carries no FK to School (the same choice FeePayment
    // makes), so the school name is resolved here in one extra query rather
    // than per row.
    const ids = [...new Set(rows.map((r) => r.schoolId))];
    const schools = ids.length
      ? await db.school.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(schools.map((s) => [s.id, s.name]));

    const totals = rows.reduce(
      (t, r) => {
        const n = Number(r.amount);
        t.all += n;
        if (r.status === 'VERIFIED') t.verified += n;
        if (r.status === 'REPORTED') t.pending += n;
        return t;
      },
      { all: 0, verified: 0, pending: 0 }
    );

    return {
      data: rows.map((r) => ({ ...r, schoolName: nameOf.get(r.schoolId) ?? 'Unknown school' })),
      totals,
    };
  }

  /**
   * School-wise ledger for the vendor: every school on the platform with what
   * it has paid and what is still unconfirmed.
   *
   * Driven from the SCHOOL list, not the payment list, on purpose — a school
   * that has never paid is exactly the row the vendor needs to see, and a
   * payments-first query would leave it out entirely.
   */
  async schoolSummary() {
    const [schools, grouped, subs] = await Promise.all([
      db.school.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      db.platformPayment.groupBy({
        by: ['schoolId', 'status'],
        _sum: { amount: true },
        _count: { _all: true },
        _max: { paidDate: true },
      }),
      db.subscription.findMany({
        where: { deletedAt: null },
        select: { schoolId: true, status: true, endDate: true, plan: { select: { name: true } } },
      }),
    ]);

    const subBySchool = new Map(subs.map((x) => [x.schoolId, x]));

    const byId = new Map<string, any>();
    for (const s of schools) {
      byId.set(s.id, {
        schoolId: s.id,
        schoolName: s.name,
        isActive: s.isActive,
        // Service state — the thing a payment actually buys.
        serviceStatus: subBySchool.get(s.id)?.status ?? 'NONE',
        validUntil: subBySchool.get(s.id)?.endDate ?? null,
        planName: subBySchool.get(s.id)?.plan?.name ?? null,
        verified: 0,
        pending: 0,
        rejected: 0,
        payments: 0,
        lastPaidDate: null as Date | null,
      });
    }

    for (const g of grouped) {
      // A payment may outlive its school (no FK, by design), so skip rows whose
      // school is gone rather than inventing a ghost entry for it.
      const row = byId.get(g.schoolId);
      if (!row) continue;

      const sum = Number(g._sum.amount ?? 0);
      if (g.status === 'VERIFIED') row.verified += sum;
      else if (g.status === 'REPORTED') row.pending += sum;
      else if (g.status === 'REJECTED') row.rejected += sum;

      row.payments += g._count._all;
      const last = g._max.paidDate;
      if (last && (!row.lastPaidDate || last > row.lastPaidDate)) row.lastPaidDate = last;
    }

    const data = [...byId.values()];
    const totals = data.reduce(
      (t, r) => {
        t.verified += r.verified;
        t.pending += r.pending;
        t.schools += 1;
        if (r.payments === 0) t.neverPaid += 1;
        return t;
      },
      { verified: 0, pending: 0, schools: 0, neverPaid: 0 }
    );

    return { data, totals };
  }

  /**
   * Flip a claim's status — and, when it is VERIFIED, extend the school's
   * service by `months`. Confirming the money and granting the service are one
   * action because they are one decision; splitting them is how a school ends
   * up paid-up but locked out.
   *
   * The extension runs from whichever is later, today or the current expiry, so
   * a school that pays early keeps the time it has left instead of losing it.
   *
   * A school with no subscription row cannot be extended — it has no plan yet.
   * The payment is still marked verified (the money did arrive) and the caller
   * is told why the service did not move, rather than the whole action failing.
   */
  async setStatus(id: string, status: string, months = 1) {
    const next = status.toUpperCase();
    if (!PAYMENT_STATUSES.includes(next as any)) {
      throw new Error(`Status must be one of ${PAYMENT_STATUSES.join(', ')}`);
    }

    const existing = await db.platformPayment.findUnique({ where: { id } });
    if (!existing) throw new Error('Payment not found');

    const n = Number(months);
    if (next === 'VERIFIED' && (!Number.isInteger(n) || n < 1 || n > 36)) {
      throw new Error('Months must be a whole number between 1 and 36');
    }

    const payment = await db.platformPayment.update({ where: { id }, data: { status: next } });
    if (next !== 'VERIFIED') return { payment, subscription: null, warning: null };

    const sub = await db.subscription.findUnique({ where: { schoolId: existing.schoolId } });
    if (!sub || sub.deletedAt) {
      return {
        payment,
        subscription: null,
        warning: 'Payment verified, but this school has no subscription plan yet — assign one to start its service.',
      };
    }

    const base = sub.endDate && sub.endDate > new Date() ? sub.endDate : new Date();
    const endDate = addMonths(base, n);

    const subscription = await db.subscription.update({
      where: { schoolId: existing.schoolId },
      data: { status: 'ACTIVE', endDate, deletedAt: null },
      include: { plan: { select: { name: true } } },
    });

    return { payment, subscription, warning: null };
  }
}

export default new PlatformBillingService();
