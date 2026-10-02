/**
 * Support — a school raises an issue, feedback or question; the vendor answers.
 *
 * Scoping rule that everything here depends on: a school may only ever touch
 * its OWN threads. Callers pass `schoolId: undefined` to mean "platform, see
 * everything" — the ROUTE decides which, never the request body, so a school
 * cannot widen its own view by sending a different id.
 */
import { db } from '@common/database/client';

export const TICKET_TYPES = ['ISSUE', 'FEEDBACK', 'QUESTION'] as const;
export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH'] as const;

const oneOf = (value: string | undefined, allowed: readonly string[], fallback: string, field: string) => {
  if (!value) return fallback;
  const v = String(value).toUpperCase();
  if (!allowed.includes(v)) throw new Error(`${field} must be one of ${allowed.join(', ')}`);
  return v;
};

export class SupportService {
  async createTicket(
    schoolId: string,
    author: { id?: string; name?: string },
    data: { type?: string; subject?: string; message?: string; priority?: string }
  ) {
    const subject = (data.subject || '').trim();
    const message = (data.message || '').trim();
    if (!subject) throw new Error('Subject is required');
    if (!message) throw new Error('Please describe the issue');

    return db.supportTicket.create({
      data: {
        schoolId,
        type: oneOf(data.type, TICKET_TYPES, 'ISSUE', 'Type'),
        priority: oneOf(data.priority, TICKET_PRIORITIES, 'NORMAL', 'Priority'),
        subject,
        message,
        status: 'OPEN',
        createdBy: author.id ?? null,
        createdByName: author.name ?? null,
      },
    });
  }

  /**
   * Threads, newest activity first. `schoolId` undefined = the platform view.
   * The school name is resolved in one extra query rather than through a
   * relation, so a thread survives its school being removed.
   */
  async listTickets(filter: { schoolId?: string; status?: string; type?: string } = {}) {
    const where: any = {};
    if (filter.schoolId) where.schoolId = filter.schoolId;
    if (filter.status) where.status = oneOf(filter.status, TICKET_STATUSES, 'OPEN', 'Status');
    if (filter.type) where.type = oneOf(filter.type, TICKET_TYPES, 'ISSUE', 'Type');

    const rows = await db.supportTicket.findMany({
      where,
      orderBy: [{ lastReplyAt: 'desc' }, { createdAt: 'desc' }],
      take: 500,
      include: { _count: { select: { replies: true } } },
    });

    const ids = [...new Set(rows.map((r) => r.schoolId))];
    const schools = ids.length
      ? await db.school.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const nameOf = new Map(schools.map((s) => [s.id, s.name]));

    return rows.map((r) => ({
      ...r,
      schoolName: nameOf.get(r.schoolId) ?? 'Unknown school',
      replyCount: r._count.replies,
    }));
  }

  /**
   * One thread with its replies. `schoolId` is passed for a school caller and
   * becomes part of the lookup, so asking for someone else's ticket id returns
   * "not found" rather than their conversation.
   */
  async getTicket(id: string, schoolId?: string) {
    const ticket = await db.supportTicket.findFirst({
      where: { id, ...(schoolId ? { schoolId } : {}) },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new Error('Ticket not found');

    const school = await db.school.findUnique({
      where: { id: ticket.schoolId },
      select: { name: true },
    });
    return { ...ticket, schoolName: school?.name ?? 'Unknown school' };
  }

  /**
   * Add a reply. The vendor answering an OPEN thread moves it to IN_PROGRESS —
   * the status should follow the work rather than wait for someone to remember
   * to set it. A RESOLVED thread the school writes on re-opens, because a reply
   * after "resolved" is almost always "it is not resolved".
   */
  async addReply(
    id: string,
    body: string,
    author: { id?: string; name?: string; fromPlatform: boolean },
    schoolId?: string
  ) {
    const text = (body || '').trim();
    if (!text) throw new Error('Reply cannot be empty');

    const ticket = await db.supportTicket.findFirst({
      where: { id, ...(schoolId ? { schoolId } : {}) },
    });
    if (!ticket) throw new Error('Ticket not found');

    const now = new Date();
    let nextStatus = ticket.status;
    if (author.fromPlatform && ticket.status === 'OPEN') nextStatus = 'IN_PROGRESS';
    if (!author.fromPlatform && ['RESOLVED', 'CLOSED'].includes(ticket.status)) nextStatus = 'OPEN';

    const [reply] = await db.$transaction([
      db.supportReply.create({
        data: {
          ticketId: id,
          body: text,
          authorId: author.id ?? null,
          authorName: author.name ?? null,
          fromPlatform: author.fromPlatform,
        },
      }),
      db.supportTicket.update({
        where: { id },
        data: { lastReplyAt: now, status: nextStatus },
      }),
    ]);

    return reply;
  }

  /** Vendor-only — the school sees the status but never sets it. */
  async setStatus(id: string, status: string) {
    const next = oneOf(status, TICKET_STATUSES, 'OPEN', 'Status');
    const ticket = await db.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new Error('Ticket not found');
    return db.supportTicket.update({ where: { id }, data: { status: next } });
  }

  /** Counters for the vendor's header tiles. */
  async stats() {
    const [byStatus, byType] = await Promise.all([
      db.supportTicket.groupBy({ by: ['status'], _count: { _all: true } }),
      db.supportTicket.groupBy({ by: ['type'], _count: { _all: true } }),
    ]);

    const countsOf = (rows: any[], key: string) =>
      rows.reduce((acc: Record<string, number>, r) => {
        acc[r[key]] = r._count._all;
        return acc;
      }, {});

    const status = countsOf(byStatus, 'status');
    return {
      status,
      type: countsOf(byType, 'type'),
      // "Needs attention" is what the vendor actually scans for — anything not
      // yet put to bed, in one number.
      pending: (status.OPEN ?? 0) + (status.IN_PROGRESS ?? 0),
      total: Object.values(status).reduce((a: number, b: any) => a + Number(b), 0),
    };
  }
}

export default new SupportService();
