import { Request, Response } from 'express';
import whatsappService from './service';
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

      successResponse(res, 200, whatsappService.getStatus(schoolId));
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to fetch status');
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
      const { to, message } = req.body;
      if (!schoolId) return void errorResponse(res, 400, 'Authentication required');
      if (!to || !message) return void errorResponse(res, 400, '"to" and "message" are required');

      const messageId = await whatsappService.sendText(schoolId, to, message);
      successResponse(res, 200, { to, messageId }, 'Message sent');
    } catch (error: any) {
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

      const results = await whatsappService.sendBulk(schoolId, recipients, content);
      const sent = results.filter((r) => r.success).length;
      successResponse(res, 200, { sent, failed: results.length - sent, results }, 'Bulk send complete');
    } catch (error: any) {
      errorResponse(res, 400, error.message || 'Failed to send bulk messages');
    }
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
