/**
 * Platform usage — the vendor's cross-tenant view of WhatsApp consumption.
 *
 * Reads the counters the WhatsApp module already keeps (WhatsAppMessageStat,
 * one row per school per day). Nothing here writes, and the WhatsApp module is
 * not touched: it is live for every school, and a reporting screen is no reason
 * to edit a 2,600-line messaging service.
 *
 * Super-admin only — enforced at the route, since every figure here spans
 * tenants.
 */
import { db } from '@common/database/client';

const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const parseDate = (v: unknown, fallback: Date): Date => {
  if (!v) return fallback;
  const d = new Date(v as string);
  if (isNaN(d.getTime())) throw new Error('Invalid date');
  return d;
};

export class PlatformUsageService {
  /**
   * WhatsApp usage per school over a window (default: last 30 days).
   *
   * Driven from the SCHOOL list, not the stats table — a school that has sent
   * nothing is exactly the row worth seeing, and a stats-first query would drop
   * it entirely. `linked` separates "has not sent anything" from "never
   * connected WhatsApp at all", which are very different conversations.
   */
  async whatsappUsage(query: { from?: string; to?: string } = {}) {
    const today = startOfDay(new Date());
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const from = startOfDay(parseDate(query.from, defaultFrom));
    const to = parseDate(query.to, new Date());
    to.setHours(23, 59, 59, 999);
    if (from > to) throw new Error('"from" cannot be after "to"');

    const [schools, grouped, linkedRows, lastRows] = await Promise.all([
      db.school.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, isActive: true },
        orderBy: { name: 'asc' },
      }),
      db.whatsAppMessageStat.groupBy({
        by: ['schoolId'],
        where: { date: { gte: from, lte: to } },
        _sum: { sent: true, failed: true, delivered: true, read: true },
      }),
      // A saved auth file is what "WhatsApp is linked" actually means here.
      db.whatsAppAuthFile.findMany({ select: { schoolId: true }, distinct: ['schoolId'] }),
      db.whatsAppMessageStat.groupBy({
        by: ['schoolId'],
        _max: { date: true },
      }),
    ]);

    const sums = new Map(grouped.map((g) => [g.schoolId, g._sum]));
    const linked = new Set(linkedRows.map((r) => r.schoolId));
    const lastSeen = new Map(lastRows.map((r) => [r.schoolId, r._max.date]));

    const data = schools.map((s) => {
      const g = sums.get(s.id);
      const sent = g?.sent ?? 0;
      const failed = g?.failed ?? 0;
      const delivered = g?.delivered ?? 0;
      const read = g?.read ?? 0;
      return {
        schoolId: s.id,
        schoolName: s.name,
        isActive: s.isActive,
        linked: linked.has(s.id),
        sent,
        failed,
        delivered,
        read,
        // Share of sent messages that actually landed. Null rather than 0 when
        // nothing was sent — "0% delivered" would read as a failure that never
        // happened.
        deliveryRate: sent > 0 ? Math.round((delivered / sent) * 100) : null,
        lastActivity: lastSeen.get(s.id) ?? null,
      };
    });

    // Heaviest users first — the point of this screen is who is consuming what.
    data.sort((a, b) => b.sent - a.sent || a.schoolName.localeCompare(b.schoolName));

    const totals = data.reduce(
      (t, r) => {
        t.sent += r.sent;
        t.failed += r.failed;
        t.delivered += r.delivered;
        t.read += r.read;
        if (r.linked) t.linkedSchools += 1;
        if (r.sent > 0) t.activeSchools += 1;
        return t;
      },
      { sent: 0, failed: 0, delivered: 0, read: 0, linkedSchools: 0, activeSchools: 0, schools: data.length }
    );

    return { data, totals, range: { from, to } };
  }

  /** Day-by-day platform total, for a small trend line under the table. */
  async whatsappDaily(query: { from?: string; to?: string } = {}) {
    const today = startOfDay(new Date());
    const defaultFrom = new Date(today);
    defaultFrom.setDate(defaultFrom.getDate() - 29);

    const from = startOfDay(parseDate(query.from, defaultFrom));
    const to = parseDate(query.to, new Date());
    to.setHours(23, 59, 59, 999);

    const rows = await db.whatsAppMessageStat.groupBy({
      by: ['date'],
      where: { date: { gte: from, lte: to } },
      _sum: { sent: true, failed: true },
      orderBy: { date: 'asc' },
    });

    return rows.map((r) => ({
      date: r.date,
      sent: r._sum.sent ?? 0,
      failed: r._sum.failed ?? 0,
    }));
  }
}

export default new PlatformUsageService();
