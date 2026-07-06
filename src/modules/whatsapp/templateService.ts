import { db } from '@common/database/client';
import whatsappService from './service';

/**
 * WhatsApp message templates with {{placeholder}} substitution and event
 * triggers. Events:
 *   MANUAL           — only sent by hand from the WhatsApp page
 *   STUDENT_CREATED  — fired automatically when a student is created
 *   PAYMENT_RECEIVED — fired automatically on fee collection (and used by the
 *                      "send receipt on WhatsApp" button)
 */
export const TEMPLATE_EVENTS = ['MANUAL', 'STUDENT_CREATED', 'PAYMENT_RECEIVED'] as const;

export class WhatsAppTemplateService {
  async list(schoolId: string) {
    return db.whatsAppTemplate.findMany({ where: { schoolId }, orderBy: { createdAt: 'asc' } });
  }

  async upsert(schoolId: string, data: any) {
    if (!data.name?.trim() || !data.body?.trim()) throw new Error('Template name and body are required');
    const event = TEMPLATE_EVENTS.includes(data.event) ? data.event : 'MANUAL';
    const payload = { name: data.name.trim(), body: data.body, event, enabled: data.enabled !== false };
    if (data.id) {
      const t = await db.whatsAppTemplate.findFirst({ where: { id: data.id, schoolId } });
      if (!t) throw new Error('Template not found');
      return db.whatsAppTemplate.update({ where: { id: data.id }, data: payload });
    }
    return db.whatsAppTemplate.upsert({
      where: { schoolId_name: { schoolId, name: payload.name } },
      update: payload,
      create: { schoolId, ...payload },
    });
  }

  async remove(schoolId: string, id: string) {
    const t = await db.whatsAppTemplate.findFirst({ where: { id, schoolId } });
    if (!t) throw new Error('Template not found');
    await db.whatsAppTemplate.delete({ where: { id } });
    return { message: 'Template deleted' };
  }

  /** Replace {{key}} placeholders (unknown keys become empty strings). */
  render(body: string, vars: Record<string, any>): string {
    return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) => {
      const v = vars[key];
      return v === null || v === undefined ? '' : String(v);
    });
  }

  /**
   * Fire every enabled template bound to `event` at `to`. Failures are
   * swallowed (WhatsApp being down must never break the business action) —
   * they are logged and reported back to the caller.
   */
  async sendEvent(
    schoolId: string,
    event: string,
    to: string | null | undefined,
    vars: Record<string, any>
  ): Promise<{ sent: number; failed: number }> {
    if (!to) return { sent: 0, failed: 0 };
    const templates = await db.whatsAppTemplate.findMany({ where: { schoolId, event, enabled: true } });
    let sent = 0, failed = 0;
    for (const t of templates) {
      try {
        await whatsappService.sendText(schoolId, to, this.render(t.body, vars));
        sent++;
      } catch (err: any) {
        failed++;
        console.error(`WhatsApp template "${t.name}" (${event}) failed:`, err?.message);
      }
    }
    return { sent, failed };
  }
}

export default new WhatsAppTemplateService();
