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
import { SendMediaRequest, SessionStatus, WhatsAppHealth, WhatsAppSessionState } from './types';

// ── Anti-ban helpers ────────────────────────────────────────────────────────
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Midnight (UTC) of the current day — the bucket key for daily message counts. */
const startOfUTCDay = (): Date => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

type StatField = 'sent' | 'failed' | 'delivered' | 'read';
type StatDelta = Record<StatField, number>;

/** Inclusive-ish random integer in [min, max] — used to jitter send spacing. */
const randomBetween = (min: number, max: number): number =>
  min >= max ? min : min + Math.floor(Math.random() * (max - min + 1));

/** One queued send. Serialized per-account so WhatsApp never sees a burst. */
interface QueueTask {
  jid: string;
  content: AnyMessageContent;
  attempts: number;
  resolve: (id: string | undefined) => void;
  reject: (err: Error) => void;
}

interface SessionMetrics {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  reconnects: number;
  lastSentAt?: number;
}

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

  // ── Anti-ban send queue (one serial queue per account) ──────────────────
  /** Pending sends, drained one/two at a time with randomized spacing. */
  queue: QueueTask[];
  /** Number of drain workers currently running (capped at sendConcurrency). */
  activeWorkers: number;
  /** Earliest epoch-ms the next send may start — enforces the random gap. */
  nextSlotAt: number;

  // ── Reconnection (never deletes credentials) ────────────────────────────
  /** Consecutive reconnect attempts; drives exponential backoff, reset on open. */
  reconnectAttempts: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;

  /** Live delivery / reliability counters for monitoring. */
  metrics: SessionMetrics;
}

// Baileys is noisy; route its logs through a silent pino instance.
const logger = pino({ level: 'silent' });

class WhatsAppService {
  private sessions = new Map<string, Session>();
  private starting = new Map<string, Promise<void>>();

  // Buffered per-school message counters. Sends and delivery receipts increment
  // an in-memory delta which is flushed to the DB every few seconds, so a busy
  // broadcast produces one durable write per window instead of one per message.
  private statBuffer = new Map<string, StatDelta>();
  private statFlushTimer?: ReturnType<typeof setTimeout>;

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
      session = {
        status: 'disconnected',
        queue: [],
        activeWorkers: 0,
        nextSlotAt: 0,
        reconnectAttempts: 0,
        metrics: { sent: 0, delivered: 0, read: 0, failed: 0, reconnects: 0 },
      };
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
        // Back online — reset the reconnect backoff and cancel any pending timer.
        session.reconnectAttempts = 0;
        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = undefined;
        }
        // Remember the linked number across restarts/refreshes.
        void this.persistNumber(schoolId, session.number ?? null);
        void this.persistAuthDirToDb(schoolId);
        // Anything queued while we were down can now flow.
        this.ensureWorkers(schoolId, session);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const replaced = statusCode === DisconnectReason.connectionReplaced;
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
        } else if (replaced) {
          // Another socket took this number over (e.g. a second server process
          // or a manual re-link). Reconnecting would start a tug-of-war that
          // WhatsApp flags as suspicious — stand down and keep the credentials.
          session.status = 'disconnected';
          session.lastError = 'This number was opened in another WhatsApp session';
          session.sock = undefined;
        } else {
          // Transient drop (network, restart-required, timeout). Reconnect with
          // exponential backoff + jitter — never wipe credentials, so the same
          // number simply comes back without a re-scan.
          session.status = 'connecting';
          session.metrics.reconnects += 1;
          this.scheduleReconnect(schoolId, session, statusCode);
        }
      }
    });

    // Delivery/read acknowledgements — a lightweight health signal so the UI
    // (and ops) can see whether messages are actually landing, not just queued.
    liveSock.ev.on('messages.update', (updates) => {
      if (session.sock !== liveSock) return;
      for (const u of updates) {
        // WAMessageStatus: 0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED
        const status = u.update?.status;
        if (status === null || status === undefined) continue;
        if (status >= 4) { session.metrics.read += 1; this.bumpStat(schoolId, 'read'); }
        else if (status === 3) { session.metrics.delivered += 1; this.bumpStat(schoolId, 'delivered'); }
        else if (status === 0) { session.metrics.failed += 1; this.bumpStat(schoolId, 'failed'); }
      }
    });
  }

  /** Schedule a credential-preserving reconnect with exponential backoff. */
  private scheduleReconnect(schoolId: string, session: Session, statusCode?: number): void {
    const attempt = (session.reconnectAttempts += 1);
    const delay = Math.min(
      config.whatsapp.reconnectMaxMs,
      config.whatsapp.reconnectBaseMs * 2 ** (attempt - 1)
    ) + randomBetween(0, 1000);
    session.lastError = `Reconnecting in ${Math.round(delay / 1000)}s (code ${statusCode ?? 'unknown'}, attempt ${attempt})`;

    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = undefined;
      this.startSocket(schoolId).catch((err) => {
        session.status = 'disconnected';
        session.lastError = err?.message || 'Reconnect failed';
      });
    }, delay);
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
      health: this.buildHealth(session),
    };
  }

  private buildHealth(session: Session): WhatsAppHealth {
    const m = session.metrics;
    return {
      queued: session.queue.length,
      sent: m.sent,
      delivered: m.delivered,
      read: m.read,
      failed: m.failed,
      reconnects: m.reconnects,
      lastSentAt: m.lastSentAt ? new Date(m.lastSentAt).toISOString() : undefined,
    };
  }

  // ── Durable message counts ─────────────────────────────────────────────────

  private statStore(): any | undefined {
    return (db as any).whatsAppMessageStat;
  }

  /** Record a message-count delta for a school; flushed to the DB shortly after. */
  private bumpStat(schoolId: string, field: StatField, n = 1): void {
    const buf = this.statBuffer.get(schoolId) ?? { sent: 0, failed: 0, delivered: 0, read: 0 };
    buf[field] += n;
    this.statBuffer.set(schoolId, buf);

    if (!this.statFlushTimer) {
      this.statFlushTimer = setTimeout(() => {
        this.statFlushTimer = undefined;
        void this.flushStats();
      }, 5000);
    }
  }

  /** Persist all buffered counters into today's per-school rows (best-effort). */
  private async flushStats(): Promise<void> {
    const store = this.statStore();
    const entries = [...this.statBuffer.entries()];
    this.statBuffer.clear();
    if (!store || !entries.length) return;

    const date = startOfUTCDay();
    for (const [schoolId, delta] of entries) {
      if (!delta.sent && !delta.failed && !delta.delivered && !delta.read) continue;
      try {
        await store.upsert({
          where: { schoolId_date: { schoolId, date } },
          create: { schoolId, date, ...delta },
          update: {
            sent: { increment: delta.sent },
            failed: { increment: delta.failed },
            delivered: { increment: delta.delivered },
            read: { increment: delta.read },
          },
        });
      } catch {
        /* stats are best-effort; never let a counter write break sending */
      }
    }
  }

  /**
   * Message-count summary for the "Message Counts" page: all-time totals, a
   * per-day breakdown for the recent window, today's tally, and live queue
   * health. Buffered counters are flushed first so the numbers are current.
   */
  async getStats(schoolId: string, days = 14): Promise<{
    totals: StatDelta;
    today: StatDelta;
    daily: Array<{ date: string } & StatDelta>;
    live: { status: SessionStatus; queued: number; reconnects: number; lastSentAt?: string };
  }> {
    await this.flushStats();

    const store = this.statStore();
    let daily: Array<{ date: string } & StatDelta> = [];
    let totals: StatDelta = { sent: 0, failed: 0, delivered: 0, read: 0 };

    if (store) {
      try {
        const since = startOfUTCDay();
        since.setUTCDate(since.getUTCDate() - (days - 1));
        const rows = await store.findMany({
          where: { schoolId, date: { gte: since } },
          orderBy: { date: 'asc' },
        });
        daily = rows.map((r: any) => ({
          date: new Date(r.date).toISOString().slice(0, 10),
          sent: r.sent,
          failed: r.failed,
          delivered: r.delivered,
          read: r.read,
        }));

        const agg = await store.aggregate({
          where: { schoolId },
          _sum: { sent: true, failed: true, delivered: true, read: true },
        });
        totals = {
          sent: agg._sum.sent ?? 0,
          failed: agg._sum.failed ?? 0,
          delivered: agg._sum.delivered ?? 0,
          read: agg._sum.read ?? 0,
        };
      } catch {
        /* table may not be migrated yet — return zeros / live health only */
      }
    }

    const todayKey = startOfUTCDay().toISOString().slice(0, 10);
    const today = daily.find((d) => d.date === todayKey) ?? { sent: 0, failed: 0, delivered: 0, read: 0 };

    const session = this.sessions.get(schoolId);
    return {
      totals,
      today: { sent: today.sent, failed: today.failed, delivered: today.delivered, read: today.read },
      daily,
      live: {
        status: session?.status ?? 'disconnected',
        queued: session?.queue.length ?? 0,
        reconnects: session?.metrics.reconnects ?? 0,
        lastSentAt: session?.metrics.lastSentAt ? new Date(session.metrics.lastSentAt).toISOString() : undefined,
      },
    };
  }

  /** Disconnect and permanently remove the linked number's credentials. */
  async logout(schoolId: string): Promise<void> {
    const session = this.sessions.get(schoolId);
    if (session) {
      // Cancel a pending reconnect so it can't resurrect the just-unlinked number.
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = undefined;
      }
      // Fail any queued sends rather than leaving their callers hanging forever.
      const pending = session.queue.splice(0);
      pending.forEach((task) => task.reject(new Error('WhatsApp was disconnected')));
    }
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
    // Enqueue every recipient at once and let the per-account queue pace them
    // (randomized 3–10s spacing, concurrency 1–2, exponential-backoff retries).
    // `send` validates the recipient synchronously, so guard that throw here so
    // one bad number can't abort the whole broadcast.
    const settled = await Promise.allSettled(
      recipients.map((to) => {
        try {
          return this.send(schoolId, to, content);
        } catch (error) {
          return Promise.reject(error);
        }
      })
    );

    return settled.map((result, i) =>
      result.status === 'fulfilled'
        ? { to: recipients[i], success: true, messageId: result.value }
        : { to: recipients[i], success: false, error: result.reason?.message || 'Send failed' }
    );
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
      throw this.permanent('WhatsApp is not connected for this school. Link a number first.');
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
        throw this.permanent('WhatsApp link has expired for this school. Scan the QR to link again.');
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('WhatsApp is reconnecting — please try again in a few seconds.');
  }

  /** Tag an error as non-retryable so the send queue rejects it immediately. */
  private permanent(message: string): Error {
    const err = new Error(message) as Error & { permanent?: boolean };
    err.permanent = true;
    return err;
  }

  /**
   * Enqueue a send onto the account's serial queue instead of hitting the
   * socket directly. Every path (single, media, bulk, template, broadcast)
   * funnels through here, so WhatsApp only ever sees a paced, jittered stream
   * from a given number — the single most important thing for not getting the
   * number banned. Resolves with the server message id once the send lands.
   */
  private send(
    schoolId: string,
    to: string,
    content: AnyMessageContent
  ): Promise<string | undefined> {
    // Validate the recipient synchronously so bad numbers fail fast (and never
    // occupy a queue slot / burn a throttle delay).
    const jid = this.toJid(to);
    const session = this.getOrInit(schoolId);

    return new Promise<string | undefined>((resolve, reject) => {
      session.queue.push({ jid, content, attempts: 0, resolve, reject });
      this.ensureWorkers(schoolId, session);
    });
  }

  /** Spin up drain workers up to the configured per-account concurrency (1–2). */
  private ensureWorkers(schoolId: string, session: Session): void {
    const target = Math.max(1, config.whatsapp.sendConcurrency || 1);
    while (session.activeWorkers < target && session.queue.length > 0) {
      session.activeWorkers += 1;
      void this.drainWorker(schoolId, session);
    }
  }

  private async drainWorker(schoolId: string, session: Session): Promise<void> {
    try {
      for (;;) {
        const task = session.queue.shift();
        if (!task) break;
        await this.processTask(schoolId, session, task);
      }
    } finally {
      session.activeWorkers -= 1;
    }
  }

  /**
   * Send one queued message: wait for its randomized throttle slot, ensure the
   * socket is live, then send — retrying transient failures with exponential
   * backoff. A single bad recipient can never wedge the queue: it either
   * succeeds, exhausts its retries, or is rejected, and the worker moves on.
   */
  private async processTask(schoolId: string, session: Session, task: QueueTask): Promise<void> {
    await this.awaitSendSlot(session);

    for (;;) {
      try {
        const live = await this.ensureConnected(schoolId);
        const sent = await live.sock!.sendMessage(task.jid, task.content);
        session.metrics.sent += 1;
        session.metrics.lastSentAt = Date.now();
        this.bumpStat(schoolId, 'sent');
        task.resolve(sent?.key?.id ?? undefined);
        return;
      } catch (error: any) {
        task.attempts += 1;
        // Permanent conditions (not linked / link expired) can't be retried away.
        if (error?.permanent || task.attempts > Math.max(0, config.whatsapp.sendRetries)) {
          session.metrics.failed += 1;
          this.bumpStat(schoolId, 'failed');
          task.reject(error instanceof Error ? error : new Error(error?.message || 'Send failed'));
          return;
        }
        // Exponential backoff with jitter before retrying this recipient.
        const backoff = Math.min(
          30000,
          config.whatsapp.sendRetryBaseMs * 2 ** (task.attempts - 1)
        ) + randomBetween(0, 500);
        session.lastError = `Send failed (attempt ${task.attempts}) — retrying in ${Math.round(backoff / 1000)}s`;
        await sleep(backoff);
      }
    }
  }

  /**
   * Block until this account's next send slot. Sends within a burst are spaced
   * a RANDOM gap apart (config min–max, default 3–10s); a lone send after an
   * idle period goes out immediately because the slot cursor is already past.
   */
  private async awaitSendSlot(session: Session): Promise<void> {
    const min = Math.max(0, config.whatsapp.minSendDelayMs);
    const max = Math.max(min, config.whatsapp.maxSendDelayMs);
    const gap = randomBetween(min, max);

    const now = Date.now();
    const slot = Math.max(now, session.nextSlotAt);
    session.nextSlotAt = slot + gap;

    const wait = slot - now;
    if (wait > 0) await sleep(wait);
  }

  /** Normalize a phone number or group id to a WhatsApp JID. */
  private toJid(to: string): string {
    const trimmed = to.trim();
    if (isJidGroup(trimmed) || trimmed.endsWith('@s.whatsapp.net')) return trimmed;
    if (trimmed.endsWith('@g.us')) return trimmed;
    const digits = trimmed.replace(/\D/g, '');
    if (!digits) throw new Error(`Invalid recipient: ${to}`);
    return `${this.withCountryCode(digits)}@s.whatsapp.net`;
  }

  /**
   * Ensure a recipient's digits carry the India country code (91). Numbers are
   * usually stored as bare 10-digit mobiles, which WhatsApp silently drops —
   * messages appear "sent" from our side but never reach the recipient. Prefix
   * 91 unless the number already includes a country code.
   */
  private withCountryCode(digits: string): string {
    // Bare 10-digit Indian mobile (starts 6–9): add the country code.
    if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
    // Local trunk-prefixed form "0XXXXXXXXXX": drop the 0, add the country code.
    if (digits.length === 11 && digits.startsWith('0') && /^0[6-9]/.test(digits)) {
      return `91${digits.slice(1)}`;
    }
    // Already 91-prefixed, or some other country's fully-qualified number.
    return digits;
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
