import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  isJidGroup,
  type WASocket,
  type AnyMessageContent,
} from '@whiskeysockets/baileys';
import { config } from '@config/environment';
import { SendMediaRequest, SessionStatus, WhatsAppSessionState } from './types';

// ─────────────────────────────────────────────────────────────────────────
// WhatsApp (Baileys) session manager — ONE socket per school.
//
// A school links its own number once by scanning the QR returned from
// `connect()` (or via a pairing code). Credentials are stored on disk under
// `sessionDir/<schoolId>` and reloaded automatically, so the same number keeps
// sending text and media to many recipients without re-scanning.
//
// The manager is a process-level singleton: sockets live in `sessions` keyed by
// schoolId. This is multi-tenant safe — every school gets an isolated socket
// and credential directory.
// ─────────────────────────────────────────────────────────────────────────

interface Session {
  sock?: WASocket;
  status: SessionStatus;
  /** Latest QR as a data-URL (PNG), present only while status === 'qr'. */
  qr?: string;
  /** Human-readable detail for the last connection change. */
  lastError?: string;
  /** The linked phone number (set once connected), e.g. "919876543210". */
  number?: string;
  /** Guards against spawning two sockets for the same school concurrently. */
  starting?: boolean;
}

// Baileys is noisy; route its logs through a silent pino instance.
const logger = pino({ level: 'silent' });

class WhatsAppService {
  private sessions = new Map<string, Session>();

  private sessionDir(schoolId: string): string {
    return path.join(config.whatsapp.sessionDir, schoolId);
  }

  private getOrInit(schoolId: string): Session {
    let session = this.sessions.get(schoolId);
    if (!session) {
      session = { status: 'disconnected' };
      this.sessions.set(schoolId, session);
    }
    return session;
  }

  /**
   * Start (or reuse) a socket for a school. Resolves as soon as the socket is
   * created — the caller polls `getStatus()` for the QR / connected state.
   */
  async connect(schoolId: string): Promise<WhatsAppSessionState> {
    const session = this.getOrInit(schoolId);

    if (session.status === 'connected') return this.getStatus(schoolId);
    if (session.starting || session.status === 'connecting' || session.status === 'qr') {
      return this.getStatus(schoolId);
    }

    await this.startSocket(schoolId);
    return this.getStatus(schoolId);
  }

  private async startSocket(schoolId: string): Promise<void> {
    const session = this.getOrInit(schoolId);
    session.starting = true;
    session.status = 'connecting';
    session.lastError = undefined;

    const authDir = this.sessionDir(schoolId);
    fs.mkdirSync(authDir, { recursive: true });

    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.appropriate(config.whatsapp.deviceName),
      // Don't sync full message history — we only send.
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    session.sock = sock;
    session.starting = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        session.status = 'qr';
        try {
          session.qr = await QRCode.toDataURL(qr);
        } catch {
          session.qr = undefined;
        }
      }

      if (connection === 'open') {
        session.status = 'connected';
        session.qr = undefined;
        session.lastError = undefined;
        session.number = sock.user?.id?.split(':')[0]?.split('@')[0];
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        session.qr = undefined;

        if (loggedOut) {
          // Credentials are dead — wipe them so the next connect shows a fresh QR.
          session.status = 'disconnected';
          session.lastError = 'Logged out';
          session.number = undefined;
          session.sock = undefined;
          this.clearAuthDir(schoolId);
        } else {
          // Transient drop (network, restart required) — reconnect.
          session.status = 'connecting';
          session.lastError = `Reconnecting (code ${statusCode ?? 'unknown'})`;
          this.startSocket(schoolId).catch((err) => {
            session.status = 'disconnected';
            session.lastError = err?.message || 'Reconnect failed';
          });
        }
      }
    });
  }

  /**
   * Request an 8-digit pairing code as an alternative to scanning the QR.
   * `number` must include the country code, digits only (e.g. 919876543210).
   */
  async requestPairingCode(schoolId: string, number: string): Promise<string> {
    const session = this.getOrInit(schoolId);
    if (!session.sock || (session.status !== 'connecting' && session.status !== 'qr')) {
      await this.startSocket(schoolId);
    }
    const sock = this.sessions.get(schoolId)?.sock;
    if (!sock) throw new Error('WhatsApp session is not initializing');
    const digits = number.replace(/\D/g, '');
    if (!digits) throw new Error('A valid phone number with country code is required');
    return sock.requestPairingCode(digits);
  }

  getStatus(schoolId: string): WhatsAppSessionState {
    const session = this.sessions.get(schoolId);
    if (!session) return { status: 'disconnected' };
    return {
      status: session.status,
      qr: session.qr,
      number: session.number,
      lastError: session.lastError,
    };
  }

  /** Disconnect and permanently remove the linked number's credentials. */
  async logout(schoolId: string): Promise<void> {
    const session = this.sessions.get(schoolId);
    try {
      await session?.sock?.logout();
    } catch {
      /* socket may already be dead — ignore */
    }
    this.clearAuthDir(schoolId);
    this.sessions.delete(schoolId);
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  /** Send a plain-text message to a single recipient. */
  async sendText(schoolId: string, to: string, text: string): Promise<string | undefined> {
    return this.send(schoolId, to, { text });
  }

  /**
   * Send media (image / video / audio / document) to a single recipient.
   * The media is supplied either as a public `url` or as a base64 `data` string.
   */
  async sendMedia(schoolId: string, req: SendMediaRequest): Promise<string | undefined> {
    const { to, mediaType, url, data, caption, filename, mimetype } = req;

    if (!url && !data) throw new Error('Either "url" or base64 "data" is required');
    // Baileys media accepts a `{ url }` object or a raw Buffer.
    const media: { url: string } | Buffer = url ? { url } : Buffer.from(data as string, 'base64');

    let content: AnyMessageContent;
    switch (mediaType) {
      case 'image':
        content = { image: media as any, caption };
        break;
      case 'video':
        content = { video: media as any, caption };
        break;
      case 'audio':
        content = { audio: media as any, mimetype: mimetype || 'audio/mp4' };
        break;
      case 'document':
        content = {
          document: media as any,
          caption,
          fileName: filename || 'document',
          mimetype: mimetype || 'application/octet-stream',
        };
        break;
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }

    return this.send(schoolId, to, content);
  }

  /**
   * Send the same content to many recipients, one by one. Returns a per-
   * recipient result so the caller can report partial failures.
   */
  async sendBulk(
    schoolId: string,
    recipients: string[],
    content: AnyMessageContent
  ): Promise<Array<{ to: string; success: boolean; messageId?: string; error?: string }>> {
    const results = [];
    for (const to of recipients) {
      try {
        const messageId = await this.send(schoolId, to, content);
        results.push({ to, success: true, messageId });
      } catch (error: any) {
        results.push({ to, success: false, error: error?.message || 'Send failed' });
      }
    }
    return results;
  }

  /** Whether linked credentials for this school exist on disk. */
  private hasSavedCreds(schoolId: string): boolean {
    return fs.existsSync(path.join(this.sessionDir(schoolId), 'creds.json'));
  }

  /**
   * Make sure the school's socket is live before sending. Sessions are held in
   * memory, so after a server restart the map is empty even though the linked
   * number's credentials are still on disk — restore the socket from them and
   * wait (bounded) for it to come up instead of failing the send.
   */
  private async ensureConnected(schoolId: string, timeoutMs = 20000): Promise<Session> {
    const session = this.getOrInit(schoolId);
    if (session.status === 'connected' && session.sock) return session;

    if (!this.hasSavedCreds(schoolId)) {
      throw new Error('WhatsApp is not connected for this school. Link a number first.');
    }
    if (!session.starting && session.status !== 'connecting' && session.status !== 'qr') {
      await this.startSocket(schoolId);
    }

    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const s = this.sessions.get(schoolId);
      if (s?.status === 'connected' && s.sock) return s;
      // A QR at this point means the saved credentials are no longer valid.
      if (s?.status === 'qr') {
        throw new Error('WhatsApp link has expired for this school. Scan the QR to link again.');
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('WhatsApp is reconnecting — please try again in a few seconds.');
  }

  private async send(
    schoolId: string,
    to: string,
    content: AnyMessageContent
  ): Promise<string | undefined> {
    const session = await this.ensureConnected(schoolId);
    const jid = this.toJid(to);
    const sent = await session.sock!.sendMessage(jid, content);
    return sent?.key?.id ?? undefined;
  }

  /** Normalize a phone number or group id to a WhatsApp JID. */
  private toJid(to: string): string {
    const trimmed = to.trim();
    if (isJidGroup(trimmed) || trimmed.endsWith('@s.whatsapp.net')) return trimmed;
    if (trimmed.endsWith('@g.us')) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) throw new Error(`Invalid recipient: ${to}`);
    return `${digits}@s.whatsapp.net`;
  }

  private clearAuthDir(schoolId: string): void {
    try {
      fs.rmSync(this.sessionDir(schoolId), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

export default new WhatsAppService();
