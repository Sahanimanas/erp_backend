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
import { db } from '@common/database/client';
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
  private starting = new Map<string, Promise<void>>();

  private sessionDir(schoolId: string): string {
    const stable = path.join(config.whatsapp.sessionDir, schoolId);
    if (fs.existsSync(path.join(stable, 'creds.json'))) return stable;

    // Older builds used a relative "./storage/whatsapp" path, so credentials
    // could land under whichever directory Node was started from. Preserve
    // those existing logins by copying them into the stable backend storage.
    const legacyDirs = [
      path.resolve(process.cwd(), 'storage/whatsapp', schoolId),
      path.resolve(process.cwd(), 'backend/storage/whatsapp', schoolId),
    ].filter((dir) => dir !== stable);

    const legacy = legacyDirs.find((dir) => fs.existsSync(path.join(dir, 'creds.json')));
    if (legacy) {
      try {
        fs.mkdirSync(stable, { recursive: true });
        fs.cpSync(legacy, stable, { recursive: true, force: false });
      } catch {
        return legacy;
      }
    }
    return stable;
  }

  private authStore(): any | undefined {
    return (db as any).whatsAppAuthFile;
  }

  private authRoots(): string[] {
    return [
      config.whatsapp.sessionDir,
      path.resolve(process.cwd(), 'storage/whatsapp'),
      path.resolve(process.cwd(), 'backend/storage/whatsapp'),
    ];
  }

  private async discoverSavedAuthSchoolIds(): Promise<string[]> {
    const ids = new Set<string>();

    for (const root of this.authRoots()) {
      try {
        if (!fs.existsSync(root)) continue;
        for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
          if (!entry.isDirectory()) continue;
          if (fs.existsSync(path.join(root, entry.name, 'creds.json'))) {
            ids.add(entry.name);
          }
        }
      } catch {
        /* ignore unreadable auth roots */
      }
    }

    const authStore = this.authStore();
    if (authStore) {
      try {
        const rows = await authStore.findMany({
          distinct: ['schoolId'],
          select: { schoolId: true },
        });
        rows.forEach((row: { schoolId: string }) => ids.add(row.schoolId));
      } catch {
        /* auth table may not be migrated yet */
      }
    }

    return [...ids];
  }

  private readAuthFilesFromDir(schoolId: string): Array<{ name: string; data: string }> {
    const dir = this.sessionDir(schoolId);
    try {
      if (!fs.existsSync(dir)) return [];
      return fs.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => ({
          name: entry.name,
          data: fs.readFileSync(path.join(dir, entry.name), 'utf8'),
        }));
    } catch {
      return [];
    }
  }

  private async persistAuthDirToDb(schoolId: string): Promise<void> {
    const authStore = this.authStore();
    if (!authStore) return;

    const files = this.readAuthFilesFromDir(schoolId);
    if (!files.length) return;

    try {
      await db.$transaction([
        authStore.deleteMany({
          where: { schoolId, name: { notIn: files.map((file) => file.name) } },
        }),
        ...files.map((file) => authStore.upsert({
          where: { schoolId_name: { schoolId, name: file.name } },
          update: { data: file.data },
          create: { schoolId, name: file.name, data: file.data },
        })),
      ]);
    } catch {
      /* disk auth still works if the database mirror is unavailable */
    }
  }

  private async hydrateAuthDirFromDb(schoolId: string): Promise<boolean> {
    const dir = this.sessionDir(schoolId);
    if (fs.existsSync(path.join(dir, 'creds.json'))) return true;

    const authStore = this.authStore();
    if (!authStore) return false;

    try {
      const files = await authStore.findMany({
        where: { schoolId },
        select: { name: true, data: true },
      });
      if (!files.length) return false;

      fs.mkdirSync(dir, { recursive: true });
      for (const file of files) {
        if (!file.name || file.name.includes('/') || file.name.includes('\\')) continue;
        fs.writeFileSync(path.join(dir, file.name), file.data, 'utf8');
      }
      return fs.existsSync(path.join(dir, 'creds.json'));
    } catch {
      return false;
    }
  }

  private async hasSavedAuth(schoolId: string): Promise<boolean> {
    if (fs.existsSync(path.join(this.sessionDir(schoolId), 'creds.json'))) return true;
    return this.hydrateAuthDirFromDb(schoolId);
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

  /** Persist / clear the linked number on the school row (non-fatal). */
  private async persistNumber(schoolId: string, number: string | null): Promise<void> {
    try {
      await db.school.update({
        where: { id: schoolId },
        data: { whatsappNumber: number, whatsappLinkedAt: number ? new Date() : null },
      });
    } catch {
      /* the link still works without the persisted copy */
    }
  }

  private async startSocket(schoolId: string): Promise<void> {
    const existing = this.starting.get(schoolId);
    if (existing) return existing;

    const start = this.doStartSocket(schoolId).finally(() => {
      this.starting.delete(schoolId);
    });
    this.starting.set(schoolId, start);
    return start;
  }

  private async doStartSocket(schoolId: string): Promise<void> {
    const session = this.getOrInit(schoolId);

    // Never let two live sockets share the same credentials — WhatsApp treats
    // that as a device conflict and eventually logs the number out (which is
    // how a "refresh + relink" used to wipe the link). Tear down the old one.
    const previous = session.sock;
    if (previous) {
      session.sock = undefined;
      try { previous.ev.removeAllListeners('connection.update'); } catch { /* ignore */ }
      try { previous.ev.removeAllListeners('creds.update'); } catch { /* ignore */ }
      try { previous.end(undefined as any); } catch { /* ignore */ }
    }

    session.starting = true;
    session.status = 'connecting';
    session.lastError = undefined;

    let sock: WASocket | undefined;
    let saveCreds: any;
    try {

    await this.hydrateAuthDirFromDb(schoolId);

    const authDir = this.sessionDir(schoolId);
    fs.mkdirSync(authDir, { recursive: true });

    const auth = await useMultiFileAuthState(authDir);
    saveCreds = auth.saveCreds;
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: auth.state,
      logger,
      printQRInTerminal: false,
      browser: Browsers.appropriate(config.whatsapp.deviceName),
      // Don't sync full message history — we only send.
      syncFullHistory: false,
      markOnlineOnConnect: false,
    });

    session.sock = sock;
    session.starting = false;
    } catch (error: any) {
      session.starting = false;
      session.status = 'disconnected';
      session.lastError = error?.message || 'WhatsApp startup failed';
      throw error;
    }
    if (!sock || !saveCreds) throw new Error('WhatsApp startup failed');
    const liveSock = sock;

    liveSock.ev.on('creds.update', () => {
      void saveCreds()
        .then(() => this.persistAuthDirToDb(schoolId))
        .catch((err: any) => {
          session.lastError = err?.message || session.lastError;
        });
    });

    liveSock.ev.on('connection.update', async (update) => {
      // A replaced socket may still emit while dying — only the current
      // socket may drive the session state (prevents reconnect storms).
      if (session.sock !== liveSock) return;

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
        session.number = liveSock.user?.id?.split(':')[0]?.split('@')[0];
        // Remember the linked number across restarts/refreshes.
        void this.persistNumber(schoolId, session.number ?? null);
        void this.persistAuthDirToDb(schoolId);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        session.qr = undefined;

        if (loggedOut) {
          // Credentials are dead — wipe them so the next connect shows a fresh
          // QR. The persisted number is kept so the UI can say WHICH number
          // needs relinking; it is only cleared on an explicit disconnect.
          session.status = 'disconnected';
          session.lastError = 'Logged out by WhatsApp — scan the QR to link again';
          session.number = undefined;
          session.sock = undefined;
          await this.clearAuth(schoolId);
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

  /** Resume saved WhatsApp sessions after a server restart. */
  async resumeLinkedSessions(): Promise<{ linked: number; resumed: number }> {
    const linkedSchools = await db.school.findMany({
      where: { whatsappNumber: { not: null } },
      select: { id: true },
    });
    const schoolIds = [
      ...new Set([
        ...linkedSchools.map((school) => school.id),
        ...(await this.discoverSavedAuthSchoolIds()),
      ]),
    ];

    let resumed = 0;
    for (const schoolId of schoolIds) {
      if (!(await this.hasSavedAuth(schoolId))) continue;
      resumed += 1;
      this.startSocket(schoolId).catch((err) => {
        console.error(`WhatsApp resume failed for school ${schoolId}:`, err?.message || err);
      });
    }

    return { linked: schoolIds.length, resumed };
  }

  /**
   * Request an 8-digit pairing code as an alternative to scanning the QR.
   * `number` must include the country code, digits only (e.g. 919876543210).
   */
  async requestPairingCode(schoolId: string, number: string): Promise<string> {
    const session = this.getOrInit(schoolId);
    if (session.status === 'connected') {
      throw new Error('A number is already linked — disconnect it first');
    }
    if (!session.sock || (session.status !== 'connecting' && session.status !== 'qr')) {
      await this.startSocket(schoolId);
    }
    const sock = this.sessions.get(schoolId)?.sock;
    if (!sock) throw new Error('WhatsApp session is not initializing');
    const digits = number.replace(/\D/g, '');
    if (!digits) throw new Error('A valid phone number with country code is required');
    return sock.requestPairingCode(digits);
  }

  async getStatus(schoolId: string): Promise<WhatsAppSessionState> {
    let session = this.sessions.get(schoolId);

    // After a server restart the in-memory map is empty even though the
    // linked credentials are still on disk. Resume the socket transparently
    // so a page refresh shows "connecting → connected" instead of looking
    // like a logout (which used to push users into relinking and conflicts).
    const idle = !session || (session.status === 'disconnected' && !session.starting);
    if (idle && await this.hasSavedAuth(schoolId)) {
      this.startSocket(schoolId).catch(() => { /* reported via lastError */ });
      session = this.sessions.get(schoolId);
    }

    // The persisted number lets the UI keep showing which number is linked
    // even while the socket is still resuming.
    let persistedNumber: string | undefined;
    try {
      const school = await db.school.findUnique({ where: { id: schoolId }, select: { whatsappNumber: true } });
      persistedNumber = school?.whatsappNumber ?? undefined;
    } catch {
      /* ignore — live session state still works */
    }

    if (!session) return { status: 'disconnected', number: persistedNumber };
    return {
      status: session.status,
      qr: session.qr,
      number: session.number ?? persistedNumber,
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
    await this.clearAuth(schoolId);
    this.sessions.delete(schoolId);
    // Explicit disconnect: forget the number too.
    await this.persistNumber(schoolId, null);
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

  /**
   * Make sure the school's socket is live before sending. Sessions are held in
   * memory, so after a server restart the map is empty even though the linked
   * number's credentials are still on disk — restore the socket from them and
   * wait (bounded) for it to come up instead of failing the send.
   */
  private async ensureConnected(schoolId: string, timeoutMs = 20000): Promise<Session> {
    const session = this.getOrInit(schoolId);
    if (session.status === 'connected' && session.sock) return session;

    if (!(await this.hasSavedAuth(schoolId))) {
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

  private async clearAuth(schoolId: string): Promise<void> {
    this.clearAuthDir(schoolId);

    const authStore = this.authStore();
    if (!authStore) return;
    try {
      await authStore.deleteMany({ where: { schoolId } });
    } catch {
      /* auth table may not be migrated yet */
    }
  }
}

export default new WhatsAppService();
