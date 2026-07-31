import { Request, Response } from 'express';
import whatsappService from './service';
import templateService, { broadcastToStudents } from './templateService';
import { successResponse, errorResponse } from '@common/utils/response';
import type { AnyMessageContent } from '@whiskeysockets/baileys';

export class WhatsAppController {
  /** Start linking (or reuse an existing session) — returns status + QR. */
  async connect(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');

      const state = await whatsappService.connect(schoolId);
      successResponse(res, 200, state, 'WhatsApp session initializing');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to start WhatsApp session');
    }
  }

  /** Poll connection state (front-end polls this to render the QR / status). */
  async status(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');

      successResponse(res, 200, await whatsappService.getStatus(schoolId));
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch status');
    }
  }

  /** Durable message counts (totals + per-day breakdown + live queue health). */
  async stats(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');

      const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '14'), 10) || 14));
      successResponse(res, 200, await whatsappService.getStats(schoolId, days));
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch message counts');
    }
  }

  /** Cancel every queued send for this school (keeps the number linked). */
  async cancelPending(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');

      const result = whatsappService.cancelPending(schoolId);
      successResponse(
        res,
        200,
        result,
        result.cancelled
          ? `Cancelled ${result.cancelled} pending message(s)`
          : 'Nothing was waiting in the queue'
      );
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to cancel pending sends');
    }
  }

  /** Request an 8-digit pairing code instead of scanning a QR. */
  async pairingCode(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { number } = req.body;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      if (!number) return void errorResponse(res, 400, 'A phone number with country code is required');

      const code = await whatsappService.requestPairingCode(schoolId, number);
      successResponse(res, 200, { code }, 'Enter this code in WhatsApp → Linked Devices');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to request pairing code');
    }
  }

  /** Unlink the number and wipe its credentials. */
  async logout(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');

      await whatsappService.logout(schoolId);
      successResponse(res, 200, null, 'WhatsApp disconnected');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to disconnect');
    }
  }

  /** Send a text message to one recipient. */
  async sendText(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { to, message, bulk } = req.body;

      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      if (!to || !message) return void errorResponse(res, 400, '"to" and "message" are required');

      const messageId = await whatsappService.sendText(schoolId, to, message, !!bulk);
      successResponse(res, 200, { to, messageId }, 'Message sent');
    } catch (error: any) {
      // console.error('Error sending WhatsApp message:', error);
      errorResponse(res, 400, error.message || 'Failed to send message');
    }
  }

  /** Send media (image / video / audio / document) to one recipient. */
  async sendMedia(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { to, mediaType } = req.body;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      if (!to || !mediaType) return void errorResponse(res, 400, '"to" and "mediaType" are required');

      const messageId = await whatsappService.sendMedia(schoolId, req.body);
      successResponse(res, 200, { to, messageId }, 'Media sent');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to send media');
    }
  }

  /** Send the same text or media to many recipients. */
  async sendBulk(req: Request, res: Response): Promise<void> {
    try {
      const schoolId = req.user?.schoolId;
      const { recipients, message, media } = req.body;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return void errorResponse(res, 400, '"recipients" must be a non-empty array');
      }
      if (!message && !media) {
        return void errorResponse(res, 400, 'Provide "message" or "media"');
      }

      const content: AnyMessageContent = message
        ? { text: message }
        : this.buildMediaContent(media);

      // Fire-and-forget: queue all recipients and return at once; the queue paces
      // them ≈1 min apart in the background (holding the request would time out).
      const { queued, invalid } = whatsappService.enqueueBulk(schoolId, recipients, content);
      successResponse(res, 200, { recipients: recipients.length, queued, invalid }, `Queued ${queued} number(s) — sending about one per minute`);
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to send bulk messages');
    }
  }

  /** Broadcast a message to all / class / section / selected students. */
  async broadcast(req: Request, res: Response): Promise<void> {
    try {
      const result = await broadcastToStudents(req.user!.schoolId, req.body);
      successResponse(res, 200, result, `Queued ${result.queued} of ${result.recipients} number(s) — sending about one per minute`);
    } catch (error: any) { errorResponse(res, 400, error.message || 'Broadcast failed'); }
  }

  /** List the school's message templates. */
  async listTemplates(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await templateService.list(req.user!.schoolId)); }
    catch (error: any) { errorResponse(res, 400, error.message); }
  }

  /** Create or update a template (body with {{placeholders}} + event). */
  async upsertTemplate(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await templateService.upsert(req.user!.schoolId, req.body), 'Template saved'); }
    catch (error: any) { errorResponse(res, error.message.includes('not found') ? 404 : 400, error.message); }
  }

  async deleteTemplate(req: Request, res: Response): Promise<void> {
    try { successResponse(res, 200, await templateService.remove(req.user!.schoolId, req.params.id)); }
    catch (error: any) { errorResponse(res, error.message.includes('not found') ? 404 : 400, error.message); }
  }

  private buildMediaContent(media: any): AnyMessageContent {
    const src = media.url ? { url: media.url } : Buffer.from(media.data as string, 'base64');
    switch (media.mediaType) {
      case 'image':
        return { image: src as any, caption: media.caption };
      case 'video':
        return { video: src as any, caption: media.caption };
      case 'audio':
        return { audio: src as any, mimetype: media.mimetype || 'audio/mp4' };
      case 'document':
        return {
          document: src as any,
          caption: media.caption,
          fileName: media.filename || 'document',
          mimetype: media.mimetype || 'application/octet-stream',
        };
      default:
        throw new Error(`Unsupported media type: ${media.mediaType}`);
    }
  }
}

export default new WhatsAppController();
