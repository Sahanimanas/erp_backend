import { db } from '@common/database/client';

const AUDIENCES = ['STUDENTS', 'TEACHERS', 'ADMINS', 'ALL'] as const;
const ADMIN_ROLES = ['SCHOOL_ADMIN', 'PRINCIPAL', 'SUPER_ADMIN'];

/** Which audience bucket a role receives. */
function inboxAudience(role: string): string {
  if (role === 'STUDENT') return 'STUDENTS';
  if (role === 'TEACHER') return 'TEACHERS';
  return 'ADMINS';
}

export class NoticeService {
  async create(schoolId: string, userId: string, role: string, data: any) {
    const audience = String(data.audience || '').toUpperCase();
    if (!AUDIENCES.includes(audience as any)) throw new Error('Invalid audience');
    if (!data.title?.trim() || !data.message?.trim()) throw new Error('Title and message are required');

    // Non-admins may only send to admins (their two-way channel to the office).
    if (!ADMIN_ROLES.includes(role) && audience !== 'ADMINS') {
      throw new Error('You can only send notices to the admin office');
    }

    const user = await db.user.findFirst({ where: { id: userId }, select: { firstName: true, lastName: true } });
    const senderName = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || 'User';

    return db.notice.create({
      data: { schoolId, senderId: userId, senderName, senderRole: role, audience, title: data.title.trim(), message: data.message.trim() },
    });
  }

  async listForUser(schoolId: string, userId: string, role: string) {
    const aud = inboxAudience(role);
    const [inbox, sent] = await Promise.all([
      db.notice.findMany({ where: { schoolId, audience: { in: [aud, 'ALL'] }, NOT: { senderId: userId } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      db.notice.findMany({ where: { schoolId, senderId: userId }, orderBy: { createdAt: 'desc' }, take: 100 }),
    ]);
    return {
      inbox: inbox.map((n) => ({ ...n, read: n.readBy.includes(userId) })),
      sent: sent.map((n) => ({ ...n, reads: n.readBy.length })),
    };
  }

  async unreadCount(schoolId: string, userId: string, role: string) {
    const aud = inboxAudience(role);
    const rows = await db.notice.findMany({ where: { schoolId, audience: { in: [aud, 'ALL'] }, NOT: { senderId: userId } }, select: { readBy: true } });
    return { count: rows.filter((n) => !n.readBy.includes(userId)).length };
  }

  async markRead(schoolId: string, id: string, userId: string) {
    const n = await db.notice.findFirst({ where: { id, schoolId } });
    if (!n) throw new Error('Notice not found');
    if (!n.readBy.includes(userId)) await db.notice.update({ where: { id }, data: { readBy: { push: userId } } });
    return { ok: true };
  }

  async remove(schoolId: string, id: string, userId: string) {
    const n = await db.notice.findFirst({ where: { id, schoolId } });
    if (!n) throw new Error('Notice not found');
    if (n.senderId !== userId) throw new Error('You can only delete notices you sent');
    await db.notice.delete({ where: { id } });
    return { ok: true };
  }
}
export default new NoticeService();
