import { db } from '@common/database/client';

const DEFAULT_INCOME_HEADS = ['Tuition FEE', 'Transport', 'books', 'Admission', 'Registration', 'Exam', 'Hostel', 'Misc'];

export class FeeMgmtService {
  // ── Fee Types (class + transport) ────────────────────────────────────────
  async listFeeTypes(schoolId: string, isTransport?: boolean) {
    const where: any = { schoolId, deletedAt: null };
    if (isTransport !== undefined) where.isTransport = isTransport;
    return db.classFeeType.findMany({ where, orderBy: { createdAt: 'asc' } });
  }

  /**
   * The `@@unique([schoolId, name])` index counts SOFT-DELETED rows too, so a
   * previously-deleted fee type keeps squatting on its name and blocks any
   * active row from taking it (create or rename → P2002). Deleted rows are
   * invisible to users, so free the name by tombstoning theirs (append their
   * unique id) before the active row claims it. Non-destructive: only renames
   * already-deleted records.
   */
  private async freeSoftDeletedName(schoolId: string, name: string, exceptId?: string) {
    const dead = await db.classFeeType.findMany({
      where: { schoolId, name, deletedAt: { not: null }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    });
    for (const row of dead) {
      await db.classFeeType.update({ where: { id: row.id }, data: { name: `${row.name} [deleted ${row.id}]` } });
    }
  }

  async createFeeType(schoolId: string, data: any) {
    const name = String(data.name ?? '').trim();
    if (!name) throw new Error('Fee type name is required');
    const exists = await db.classFeeType.findFirst({ where: { schoolId, name, deletedAt: null } });
    if (exists) throw new Error('A fee type with this name already exists');
    await this.freeSoftDeletedName(schoolId, name);
    return db.classFeeType.create({
      data: {
        schoolId,
        name,
        frequency: data.frequency || 'Monthly',
        months: Array.isArray(data.months) ? data.months : [],
        incomeHead: data.incomeHead || null,
        isTransport: !!data.isTransport,
        enabled: data.enabled !== false,
      },
    });
  }

  async updateFeeType(schoolId: string, id: string, data: any) {
    const ft = await db.classFeeType.findFirst({ where: { id, schoolId } });
    if (!ft) throw new Error('Fee type not found');

    const patch: any = {
      frequency: data.frequency ?? ft.frequency,
      months: Array.isArray(data.months) ? data.months : ft.months,
      incomeHead: data.incomeHead ?? ft.incomeHead,
      enabled: data.enabled ?? ft.enabled,
      isTransport: data.isTransport ?? ft.isTransport,
    };

    // Only touch the name when it actually changes, and guard the unique index:
    // an ACTIVE clash is a real duplicate (friendly error); a SOFT-DELETED clash
    // is a tombstone we can release so the rename goes through.
    if (data.name !== undefined && data.name !== null) {
      const name = String(data.name).trim();
      if (!name) throw new Error('Fee type name is required');
      if (name !== ft.name) {
        const clash = await db.classFeeType.findFirst({ where: { schoolId, name, deletedAt: null, id: { not: id } } });
        if (clash) throw new Error(`A fee type named "${name}" already exists`);
        await this.freeSoftDeletedName(schoolId, name, id);
      }
      patch.name = name;
    }

    return db.classFeeType.update({ where: { id }, data: patch });
  }

  async deleteFeeType(schoolId: string, id: string) {
    const ft = await db.classFeeType.findFirst({ where: { id, schoolId } });
    if (!ft) throw new Error('Fee type not found');
    // Soft-delete the type AND disable its per-class structures, otherwise the
    // student-facing fee queries (which key off `enabled`) keep charging it.
    await db.$transaction([
      db.classFeeType.update({ where: { id }, data: { deletedAt: new Date() } }),
      db.classFeeStructure.updateMany({ where: { schoolId, feeTypeId: id }, data: { enabled: false } }),
    ]);
    return { message: 'Fee type deleted' };
  }

  // ── Per-class fee structure ───────────────────────────────────────────────
  /**
   * For a class, return every (non-transport) fee type with the amount/enabled
   * currently configured for that class (0/false when not yet set). Drives both
   * "Manage Class Fee" (editable) and "Class Fee Structure" (read-only) screens.
   */
  async getClassStructure(schoolId: string, classId: string, includeTransport = false, academicYearId?: string) {
    const where: any = { schoolId, deletedAt: null };
    if (!includeTransport) where.isTransport = false;
    // Scope amounts to the selected session. When a session is given, only that
    // session's rows are returned (others come back as 0/disabled), so switching
    // sessions no longer shows another session's values. Null-session (legacy)
    // rows are included as a fallback when no session-specific row exists.
    const structWhere: any = { schoolId, classId };
    // Prisma's `in` does not accept null — use OR to include legacy rows.
    if (academicYearId) structWhere.OR = [{ academicYearId }, { academicYearId: null }];
    const [types, structures] = await Promise.all([
      db.classFeeType.findMany({ where, orderBy: { createdAt: 'asc' } }),
      db.classFeeStructure.findMany({ where: structWhere }),
    ]);
    // The map below keeps the LAST row per feeTypeId, so order the exact-session
    // row last to prefer it over the legacy null-session fallback.
    structures.sort((a, b) => (a.academicYearId === academicYearId ? 1 : -1));
    const byType = new Map(structures.map((s) => [s.feeTypeId, s]));
    return types.map((t) => {
      const s = byType.get(t.id);
      return {
        feeTypeId: t.id,
        name: t.name,
        frequency: t.frequency,
        months: t.months,
        incomeHead: t.incomeHead,
        feeTypeActive: t.enabled,
        amount: s ? Number(s.amount) : 0,
        enabled: s ? s.enabled : false,
      };
    });
  }

  async saveClassStructure(schoolId: string, classId: string, items: any[], academicYearId?: string) {
    if (!classId) throw new Error('classId is required');
    if (!Array.isArray(items)) throw new Error('items[] required');
    const sessionId = academicYearId || null;
    let saved = 0;
    for (const it of items) {
      if (!it.feeTypeId) continue;
      const amount = BigInt(Math.round(Number(it.amount) || 0));
      const enabled = !!it.enabled;
      // Upsert scoped to the selected session so each session keeps its own row.
      const existing = await db.classFeeStructure.findFirst({ where: { classId, feeTypeId: it.feeTypeId, academicYearId: sessionId } });
      if (existing) {
        await db.classFeeStructure.update({ where: { id: existing.id }, data: { amount, enabled } });
      } else {
        await db.classFeeStructure.create({ data: { schoolId, classId, feeTypeId: it.feeTypeId, academicYearId: sessionId, amount, enabled } });
      }
      saved++;
    }
    return { saved };
  }

  // ── Transport routes + route fee ──────────────────────────────────────────
  async listRoutes(schoolId: string) {
    return db.transportRoute.findMany({ where: { schoolId, deletedAt: null }, orderBy: { name: 'asc' } });
  }

  async upsertRoute(schoolId: string, data: any) {
    if (!data.name) throw new Error('Route name is required');
    const fee = BigInt(Math.round(Number(data.fee) || 0));
    if (data.id) {
      const r = await db.transportRoute.findFirst({ where: { id: data.id, schoolId } });
      if (!r) throw new Error('Route not found');
      return db.transportRoute.update({ where: { id: data.id }, data: { name: data.name, fee } });
    }
    const existing = await db.transportRoute.findFirst({ where: { schoolId, name: data.name, deletedAt: null } });
    if (existing) return db.transportRoute.update({ where: { id: existing.id }, data: { fee } });
    return db.transportRoute.create({ data: { schoolId, name: data.name.trim(), fee } });
  }

  async incomeHeads(schoolId: string) {
    const types = await db.classFeeType.findMany({ where: { schoolId, deletedAt: null }, select: { incomeHead: true } });
    const used = types.map((t) => t.incomeHead).filter(Boolean) as string[];
    return Array.from(new Set([...DEFAULT_INCOME_HEADS, ...used]));
  }
}

export default new FeeMgmtService();
