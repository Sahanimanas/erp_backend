import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import QRCode from 'qrcode';
import pino from 'pino';
import makeWASocket, {
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  fetchLatestBaileysVersion,
  DisconnectReason,
  Browsers,
  isJidGroup,
  type WASocket,
  type AnyMessageContent,
  type WAMessageContent,
  type WAMessageKey,
} from '@whiskeysockets/baileys';
import { config } from '@config/environment';
import { db } from '@common/database/client';
import { SendMediaRequest, SessionStatus, WhatsAppHealth, WhatsAppSessionState } from './types';
import { resolveMedia, inferMediaType } from './media';

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

/**
 * Expand "spintax" — `{Dear|Hello|Hi}` picks one alternative at random — so a
 * broadcast doesn't send hundreds of byte-identical messages from one number
 * (identical mass content is one of the things WhatsApp's spam scoring keys on).
 *
 * Only groups that actually contain a `|` are touched, so `{{placeholder}}`
 * template syntax passes through untouched. Nested groups resolve
 * inside-out over repeated passes.
 */
export const expandSpintax = (text: string): string => {
  let out = text;
  for (let pass = 0; pass < 5 && /\{[^{}]*\|[^{}]*\}/.test(out); pass++) {
    out = out.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, group: string) => {
      const options = group.split('|');
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return out;
};

/** One queued send. Serialized per-account so WhatsApp never sees a burst. */
interface QueueTask {
  jid: string;
  content: AnyMessageContent;
  attempts: number;
  /** Pace with the wide bulk delay (≈1 min) instead of the fast interactive one. */
  bulk?: boolean;
  resolve: (id: string | undefined) => void;
  reject: (err: Error) => void;
}

interface SessionMetrics {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  reconnects: number;
  /** Bulk sends dropped as an exact repeat of a very recent one. */
  skippedDuplicates: number;
  lastSentAt?: number;
}

/**
 * Per-number send volume, bucketed by UTC day and clock hour. This is what
 * enforces the daily / hourly caps — the single most effective protection
 * against a number being blocked, since blast volume is what WhatsApp's
 * anti-spam actually scores.
 */
interface SendUsage {
  dayKey: string;
  day: number;
  hourKey: string;
  hour: number;
  /** Today's count has been seeded from the durable stats table. */
  seeded: boolean;
  /** When the number was linked — drives the warm-up ramp (epoch ms). */
  linkedAt?: number;
  /** The linked-at lookup has been done (even if it found nothing). */
  linkedAtLoaded?: boolean;
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

  // ── Anti-ban send queues (per account) ──────────────────────────────────
  // Interactive and bulk are kept in SEPARATE queues with their own workers and
  // their own throttle cursors. With one shared queue + one worker, a worker
  // sleeping out a ≈1-min bulk gap also blocked every interactive send behind
  // it — unshifting to the head of the queue could not help, because nothing
  // was free to pick the task up.
  /** Pending interactive sends, drained with the fast gap (default 3–10s). */
  queue: QueueTask[];
  /** Pending bulk sends, drained one at a time with the wide gap (≈1 min). */
  bulkQueue: QueueTask[];
  /** Interactive drain workers running (capped at sendConcurrency). */
  activeWorkers: number;
  /** Whether the single bulk drain worker is running. */
  bulkWorkerActive: boolean;
  /** Earliest epoch-ms the next interactive send may start. */
  nextSlotAt: number;
  /** Earliest epoch-ms the next bulk send may start (independent cursor). */
  nextBulkSlotAt: number;

  /**
   * Cache of "is this number actually on WhatsApp" lookups, keyed by JID.
   * Bounded and TTL'd. Sending to a number that has no WhatsApp account
   * succeeds locally and delivers nothing, which is indistinguishable from a
   * broken link from the UI's point of view — so we check first.
   */
  jidChecks: Map<string, { jid: string; exists: boolean; at: number }>;

  // ── Reconnection (never deletes credentials) ────────────────────────────
  /** Consecutive reconnect attempts; drives exponential backoff, reset on open. */
  reconnectAttempts: number;
  /**
   * How many 515 (restartRequired) restarts we've done since the last successful
   * open. These are protocol-mandated, not failures, so they don't count as
   * reconnect attempts — but they're capped so a genuine 515 loop can't spin.
   */
  restartRequiredCount?: number;
  reconnectTimer?: ReturnType<typeof setTimeout>;
  /**
   * Set when WhatsApp logged the number out, another device took it over, or
   * reconnects were exhausted. While true NOTHING auto-starts a socket — only an
   * explicit `connect()` does. This is deliberate: silently re-registering a
   * number in a loop is one of the strongest ban signals there is.
   */
  requiresRelink?: boolean;
  /** Epoch-ms of the last socket-start attempt — enforces the start cooldown. */
  lastStartAt: number;

  // ── Circuit breaker ─────────────────────────────────────────────────────
  /**
   * While set (epoch-ms), the queue holds everything back. Tripped by a
   * rate-limit error or a run of consecutive failures: continuing to push
   * messages into a number WhatsApp is already throttling is how a temporary
   * restriction becomes a permanent ban.
   */
  cooldownUntil?: number;
  /** Consecutive send failures; reset by any success. Drives the breaker. */
  consecutiveFailures: number;
  /**
   * `jid|content-hash` → epoch-ms of the last identical bulk send. A repeated
   * broadcast (double-clicked "Send", a retried job) otherwise messages the
   * same parents twice within minutes, which reads as spam to both WhatsApp
   * and the recipient.
   */
  recentSends: Map<string, number>;

  /** Live delivery / reliability counters for monitoring. */
  metrics: SessionMetrics;

  /**
   * Recently-sent messages, keyed by message id (bounded, FIFO-evicted).
   * Baileys' `getMessage` reads from here to answer a recipient's retry
   * receipt by re-encrypting the original content — without it, a message the
   * recipient failed to decrypt stays stuck as "Waiting for this message".
   */
  sentMessages: Map<string, WAMessageContent>;
}

/** Cap on cached sent messages per school, to bound memory for retry replays. */
const SENT_CACHE_LIMIT = 1000;

/**
 * "Is this number on WhatsApp" lookups are cached per school. The TTL is short
 * enough that a number which later joins WhatsApp isn't blocked for long, and
 * long enough that a broadcast to one class doesn't re-query per message.
 */
const JID_CHECK_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const JID_CHECK_LIMIT = 5000;
/** Cap on how long the recipient lookup may hold up a send before we proceed. */
const JID_CHECK_TIMEOUT_MS = 8000;

/**
 * How many protocol-mandated 515 restarts to allow before treating them as a
 * real fault. Pairing normally needs exactly one; more than a handful means
 * something is genuinely wrong and should fall back to backoff.
 */
const MAX_RESTART_REQUIRED = 5;

/**
 * Marker file dropped in a school's auth dir when the number needs a deliberate
 * relink. Kept on disk (rather than in the DB) so it survives restarts without
 * a schema change, and travels with the credentials it describes.
 */
const RELINK_MARKER = '.relink-required';

/**
 * How long to coalesce `creds.update` events before mirroring the auth
 * directory to the DB, and how many rows to write per transaction. Both exist
 * to keep the mirror off the critical path of the shared Prisma pool.
 */
const AUTH_MIRROR_DEBOUNCE_MS = 5000;
const AUTH_MIRROR_CHUNK = 25;

// Baileys is noisy, so it is silent by default — but "silent" also means that
// when a session goes wrong there is NOTHING to look at. WHATSAPP_LOG_LEVEL
// ('debug' / 'trace' / 'warn') opens it back up for diagnosis without a rebuild.
const logger = pino({ level: config.whatsapp.logLevel || 'silent' });

class WhatsAppService {
  private sessions = new Map<string, Session>();
  private starting = new Map<string, Promise<void>>();

  // Buffered per-school message counters. Sends and delivery receipts increment
  // an in-memory delta which is flushed to the DB every few seconds, so a busy
  // broadcast produces one durable write per window instead of one per message.
  private statBuffer = new Map<string, StatDelta>();
  private statFlushTimer?: ReturnType<typeof setTimeout>;

  // Per-school send volume for the daily / hourly caps. Today's figure is
  // seeded from the durable stats table on first use, so a server restart can't
  // hand a number a fresh allowance mid-day.
  private usage = new Map<string, SendUsage>();

  // Auth-directory mirroring state: what we last wrote (name → content hash),
  // the pending debounce timer, and the in-flight write per school.
  private mirroredHashes = new Map<string, Map<string, string>>();
  private mirrorTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private mirrorInFlight = new Map<string, Promise<void>>();

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
        // The relink marker is local bookkeeping, not a credential — keep it out
        // of the DB mirror so it never round-trips back onto another host.
        .filter((entry) => entry.isFile() && entry.name !== RELINK_MARKER)
        .map((entry) => ({
          name: entry.name,
          data: fs.readFileSync(path.join(dir, entry.name), 'utf8'),
        }));
    } catch {
      return [];
    }
  }

  /**
   * Queue a mirror of this school's auth directory to the DB.
   *
   * `creds.update` fires constantly — many times a second during a LID
   * migration or a key exchange — and a session directory holds hundreds of
   * key files. Mirroring everything on every event opened a long multi-hundred
   * -statement transaction per event, which exhausted the Prisma pool
   * (P2024 "timed out fetching a connection") and made UNRELATED requests fail
   * with a 500. So: coalesce the events, and let the writer send only deltas.
   */
  private scheduleAuthMirror(schoolId: string): void {
    if (this.mirrorTimers.has(schoolId)) return; // one is already pending
    const timer = setTimeout(() => {
      this.mirrorTimers.delete(schoolId);
      void this.persistAuthDirToDb(schoolId);
    }, AUTH_MIRROR_DEBOUNCE_MS);
    this.mirrorTimers.set(schoolId, timer);
  }

  private async persistAuthDirToDb(schoolId: string): Promise<void> {
    const authStore = this.authStore();
    if (!authStore) return;

    // Single-flight per school: concurrent mirrors would each hold a connection
    // for the length of their writes, which is the pool exhaustion all over again.
    const running = this.mirrorInFlight.get(schoolId);
    if (running) return running;

    const run = this.doPersistAuthDirToDb(schoolId, authStore).finally(() => {
      this.mirrorInFlight.delete(schoolId);
    });
    this.mirrorInFlight.set(schoolId, run);
    return run;
  }

  private async doPersistAuthDirToDb(schoolId: string, authStore: any): Promise<void> {
    const files = this.readAuthFilesFromDir(schoolId);
    if (!files.length) return;

    const digest = (data: string): string => crypto.createHash('sha1').update(data).digest('hex');

    // After a restart the hash map is empty, which would make the first mirror
    // rewrite every key file again. Seed it from what the DB already holds —
    // one read instead of hundreds of pointless upserts.
    let cached = this.mirroredHashes.get(schoolId);
    if (!cached) {
      cached = new Map<string, string>();
      try {
        const rows = await authStore.findMany({ where: { schoolId }, select: { name: true, data: true } });
        for (const row of rows) cached.set(row.name, digest(row.data));
      } catch {
        /* mirror table unavailable — fall through and treat everything as new */
      }
      this.mirroredHashes.set(schoolId, cached);
    }
    const seen = cached;

    // Only files whose contents actually changed since the last mirror. In
    // steady state this is one or two rows instead of several hundred.
    const changed = files.filter((file) => seen.get(file.name) !== digest(file.data));
    const names = new Set(files.map((file) => file.name));
    const removed = [...seen.keys()].filter((name) => !names.has(name));

    if (!changed.length && !removed.length) return;

    try {
      // Written in small chunks rather than one giant transaction, so a mirror
      // never holds a pooled connection long enough to starve live requests.
      for (let i = 0; i < changed.length; i += AUTH_MIRROR_CHUNK) {
        const chunk = changed.slice(i, i + AUTH_MIRROR_CHUNK);
        await db.$transaction(
          chunk.map((file) => authStore.upsert({
            where: { schoolId_name: { schoolId, name: file.name } },
            update: { data: file.data },
            create: { schoolId, name: file.name, data: file.data },
          }))
        );
        chunk.forEach((file) => seen.set(file.name, digest(file.data)));
      }

      if (removed.length) {
        await authStore.deleteMany({ where: { schoolId, name: { in: removed } } });
        removed.forEach((name) => seen.delete(name));
      }

      this.mirroredHashes.set(schoolId, seen);
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
        bulkQueue: [],
        activeWorkers: 0,
        bulkWorkerActive: false,
        nextSlotAt: 0,
        nextBulkSlotAt: 0,
        jidChecks: new Map(),
        reconnectAttempts: 0,
        lastStartAt: 0,
        consecutiveFailures: 0,
        recentSends: new Map(),
        metrics: { sent: 0, delivered: 0, read: 0, failed: 0, reconnects: 0, skippedDuplicates: 0 },
        sentMessages: new Map(),
      };
      // A previous logout / exhausted reconnect is remembered on disk, so a
      // server restart doesn't undo it and start re-registering the number.
      session.requiresRelink = this.readRelinkMarker(schoolId);
      this.sessions.set(schoolId, session);
    }
    return session;
  }

  // ── Relink marker (survives restarts, no migration needed) ────────────────

  private relinkMarkerPath(schoolId: string): string {
    return path.join(this.sessionDir(schoolId), RELINK_MARKER);
  }

  private readRelinkMarker(schoolId: string): boolean {
    try {
      return fs.existsSync(this.relinkMarkerPath(schoolId));
    } catch {
      return false;
    }
  }

  /**
   * Latch "this number must be relinked by hand". Every auto-start path checks
   * this, so a dead link can never turn into a silent re-registration loop.
   */
  private setRelinkRequired(schoolId: string, session: Session, reason: string): void {
    session.requiresRelink = true;
    session.status = 'disconnected';
    session.lastError = reason;
    session.qr = undefined;
    session.sock = undefined;
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = undefined;
    }
    try {
      const dir = this.sessionDir(schoolId);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.relinkMarkerPath(schoolId), `${reason}\n${new Date().toISOString()}\n`, 'utf8');
    } catch {
      /* the in-memory flag still holds for this process */
    }
  }

  private clearRelinkRequired(schoolId: string, session: Session): void {
    session.requiresRelink = false;
    try {
      fs.rmSync(this.relinkMarkerPath(schoolId), { force: true });
    } catch {
      /* ignore */
    }
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

    // An admin asking to link is the ONLY thing that lifts the relink latch. The
    // dead credentials are dropped here (once, deliberately) rather than the
    // moment WhatsApp logged us out, so nothing in the background can turn a
    // logout into a re-registration loop.
    if (session.requiresRelink) {
      await this.clearAuth(schoolId);
      this.clearRelinkRequired(schoolId, session);
      session.reconnectAttempts = 0;
      session.restartRequiredCount = 0;
      session.lastStartAt = 0;
      session.number = undefined;
      session.lastError = undefined;
    }

    await this.startSocket(schoolId);
    return this.getStatus(schoolId);
  }

  /** Persist / clear the linked number on the school row (non-fatal). */
  private async persistNumber(schoolId: string, number: string | null): Promise<void> {
    try {
      const existing = await db.school.findUnique({
        where: { id: schoolId },
        select: { whatsappNumber: true, whatsappLinkedAt: true },
      });
      // Keep the ORIGINAL link timestamp when the same number simply reconnects.
      // It drives the warm-up ramp, and this runs on every `connection: open` —
      // rewriting it per reconnect would pin a long-established number at
      // day-one limits forever.
      const sameNumber = !!number && existing?.whatsappNumber === number && !!existing?.whatsappLinkedAt;

      await db.school.update({
        where: { id: schoolId },
        data: {
          whatsappNumber: number,
          ...(sameNumber ? {} : { whatsappLinkedAt: number ? new Date() : null }),
        },
      });

      // A new link date changes the warm-up cap — force it to be re-read.
      const usage = this.usage.get(schoolId);
      if (usage && !sameNumber) usage.linkedAtLoaded = false;
    } catch {
      /* the link still works without the persisted copy */
    }
  }

  /**
   * @param scheduled true when the caller is the reconnect timer, which is
   *   already rate-limited by its own backoff and MUST bypass the start
   *   cooldown below.
   */
  private async startSocket(schoolId: string, scheduled = false): Promise<void> {
    const existing = this.starting.get(schoolId);
    if (existing) return existing;

    const session = this.getOrInit(schoolId);
    if (session.requiresRelink) {
      throw this.permanent(session.lastError || 'This number must be relinked — scan the QR from the WhatsApp page.');
    }

    // Rate-limit socket creation per school. Status polling and sends funnel
    // through here; without this they could stack up into back-to-back
    // registrations of the same number.
    //
    // The reconnect timer is EXEMPT. WhatsApp demands a stream restart (515)
    // about a second after a socket comes up during pairing — far inside this
    // cooldown — so counting it here silently swallowed the restart and left
    // the session parked on "connecting" forever: no QR, no reconnect, and
    // getStatus() only auto-restarts a 'disconnected' session, so nothing ever
    // recovered it. That is the "Finishing link — restarting session…" hang.
    // The timer's own backoff is the rate limit for this path.
    const since = Date.now() - session.lastStartAt;
    const cooldown = Math.max(0, config.whatsapp.startCooldownMs);
    if (!scheduled && session.lastStartAt && since < cooldown) return;
    session.lastStartAt = Date.now();

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
      auth: {
        creds: auth.state.creds,
        // Cache the Signal key store in memory instead of hitting disk on
        // every read/write. This removes the read/write races in the raw file
        // store that corrupt session keys and leave recipients unable to
        // decrypt — the "Waiting for this message" symptom — and cuts the disk
        // churn that was contributing to unexpected logouts.
        keys: makeCacheableSignalKeyStore(auth.state.keys, logger),
      },
      logger,
      printQRInTerminal: false,
      browser: Browsers.appropriate(config.whatsapp.deviceName),
      // Don't sync full message history — we only send.
      syncFullHistory: false,
      markOnlineOnConnect: false,
      // When a recipient can't decrypt a message it asks the sender to resend
      // (a "retry receipt"). Baileys can only honour that if it can look the
      // original content back up — so we serve it from our sent-message cache.
      // Without this the message is never re-encrypted and stays stuck on the
      // recipient's phone as "Waiting for this message".
      getMessage: async (key: WAMessageKey): Promise<WAMessageContent | undefined> => {
        const id = key?.id;
        if (!id) return undefined;
        return session.sentMessages.get(id);
      },
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
      // Disk write is immediate (it is the source of truth); the DB mirror is
      // debounced, because this event can fire many times a second.
      void saveCreds()
        .then(() => this.scheduleAuthMirror(schoolId))
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
        session.restartRequiredCount = 0;
        if (session.reconnectTimer) {
          clearTimeout(session.reconnectTimer);
          session.reconnectTimer = undefined;
        }
        // Remember the linked number across restarts/refreshes.
        void this.persistNumber(schoolId, session.number ?? null);
        this.scheduleAuthMirror(schoolId);
        // Anything queued while we were down can now flow.
        this.ensureWorkers(schoolId, session);
      }

      if (connection === 'close') {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        const replaced = statusCode === DisconnectReason.connectionReplaced;
        session.qr = undefined;

        if (loggedOut) {
          // Latch "needs relinking" and STOP. We deliberately do not wipe the
          // credentials here: wiping them used to let the very next status poll
          // or send start a fresh registration, so a single logout could snowball
          // into repeated re-registrations of the number — which is exactly the
          // pattern WhatsApp bans for. The creds are dropped in `connect()`
          // instead, when an admin actually asks to relink.
          this.setRelinkRequired(schoolId, session, 'Logged out by WhatsApp — press “Link Number” to scan a fresh QR');
        } else if (replaced) {
          // Another socket took this number over (e.g. a second server process
          // or a manual re-link). Reconnecting would start a tug-of-war that
          // WhatsApp flags as suspicious — stand down and keep the credentials.
          this.setRelinkRequired(schoolId, session, 'This number was opened in another WhatsApp session — relink when it is free');
        } else if (
          statusCode === DisconnectReason.restartRequired &&
          (session.restartRequiredCount ?? 0) < MAX_RESTART_REQUIRED
        ) {
          // 515 restartRequired is NOT an error: WhatsApp requires the stream to
          // be restarted once immediately after a fresh QR pairing. Treating it
          // as a transient failure made a normal link look broken — it burned a
          // reconnect attempt toward the relink latch and sat through the
          // exponential backoff. Restart at once and don't charge an attempt.
          session.restartRequiredCount = (session.restartRequiredCount ?? 0) + 1;
          session.status = 'connecting';
          session.lastError = 'Finishing link — restarting session…';
          this.scheduleReconnect(schoolId, session, statusCode, true);
        } else if (session.reconnectAttempts >= Math.max(1, config.whatsapp.reconnectMaxAttempts)) {
          // Reconnects exhausted. Keep the credentials, but stop trying: an
          // endless retry loop hammers WhatsApp's registration path and is read
          // as abusive. An admin can resume from the WhatsApp page.
          this.setRelinkRequired(
            schoolId,
            session,
            `Could not reconnect after ${session.reconnectAttempts} attempts — press “Link Number” to resume`
          );
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
        // Per-message receipt trace. Without it you cannot tell "WhatsApp never
        // acked it" from "acked but the handset never got it" — the difference
        // between a broken link and a bad recipient.
        console.log(
          `[whatsapp] receipt school=${schoolId} id=${u.key?.id ?? 'n/a'} ` +
          `to=${u.key?.remoteJid ?? 'n/a'} status=${status}` +
          ` (${['ERROR', 'PENDING', 'SERVER_ACK', 'DELIVERY_ACK', 'READ', 'PLAYED'][status] ?? '?'})`
        );
        if (status >= 4) { session.metrics.read += 1; this.bumpStat(schoolId, 'read'); }
        else if (status === 3) { session.metrics.delivered += 1; this.bumpStat(schoolId, 'delivered'); }
        else if (status === 0) { session.metrics.failed += 1; this.bumpStat(schoolId, 'failed'); }
      }
    });

    // Baileys reports some delivery/read receipts on this event rather than
    // `messages.update`. Trace-only: metrics stay on the handler above so a
    // receipt delivered on both paths is never counted twice. Without this,
    // "no receipts" is ambiguous between "not delivered" and "we weren't
    // listening on the right event".
    liveSock.ev.on('message-receipt.update', (updates) => {
      if (session.sock !== liveSock) return;
      for (const u of updates as any[]) {
        console.log(
          `[whatsapp] receipt2 school=${schoolId} id=${u?.key?.id ?? 'n/a'} ` +
          `to=${u?.key?.remoteJid ?? 'n/a'} type=${u?.receipt?.receiptTimestamp ? 'delivery' : u?.receipt?.readTimestamp ? 'read' : 'other'}`
        );
      }
    });
  }

  /**
   * Schedule a credential-preserving reconnect with exponential backoff.
   *
   * `immediate` is for protocol-mandated restarts (515) — reconnect almost at
   * once and do NOT charge a reconnect attempt, so a normal pairing can't drift
   * toward the "needs relinking" latch or make the user sit through backoff.
   */
  private scheduleReconnect(
    schoolId: string,
    session: Session,
    statusCode?: number,
    immediate = false
  ): void {
    let delay: number;
    if (immediate) {
      delay = randomBetween(250, 750);
    } else {
      const attempt = (session.reconnectAttempts += 1);
      delay = Math.min(
        config.whatsapp.reconnectMaxMs,
        config.whatsapp.reconnectBaseMs * 2 ** (attempt - 1)
      ) + randomBetween(0, 1000);
      session.lastError = `Reconnecting in ${Math.round(delay / 1000)}s (code ${statusCode ?? 'unknown'}, attempt ${attempt})`;
    }

    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = undefined;
      // `scheduled` — this path is rate-limited by the backoff above, so it must
      // not also be gated by the start cooldown (see startSocket).
      this.startSocket(schoolId, true).catch((err) => {
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
      // A number latched for relinking stays down across restarts — otherwise
      // every deploy would silently re-register a number WhatsApp already
      // rejected once.
      if (this.getOrInit(schoolId).requiresRelink) {
        console.warn(`WhatsApp resume skipped for school ${schoolId}: awaiting a deliberate relink`);
        continue;
      }
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
    // …but never when the number is latched for a deliberate relink, or the poll
    // itself becomes the thing that keeps re-registering it.
    const latched = this.getOrInit(schoolId).requiresRelink;
    const idle = !latched && (!session || (session.status === 'disconnected' && !session.starting));

    // Safety net: a session showing 'connecting' with no live socket, nothing
    // starting and no reconnect scheduled is STRANDED — no other path will ever
    // revive it, because the auto-restart above only fires for 'disconnected'.
    // Recover it once the start cooldown has elapsed.
    const stranded =
      !latched &&
      !!session &&
      session.status === 'connecting' &&
      !session.sock &&
      !session.starting &&
      !session.reconnectTimer &&
      Date.now() - session.lastStartAt > Math.max(0, config.whatsapp.startCooldownMs);

    if ((idle || stranded) && await this.hasSavedAuth(schoolId)) {
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

    if (!session) return { status: 'disconnected', number: persistedNumber, requiresRelink: latched };
    return {
      status: session.status,
      qr: session.qr,
      number: session.number ?? persistedNumber,
      lastError: session.lastError,
      health: this.buildHealth(schoolId, session),
      requiresRelink: session.requiresRelink,
    };
  }

  private buildHealth(schoolId: string, session: Session): WhatsAppHealth {
    const m = session.metrics;
    const usage = this.usageFor(schoolId);
    const dailyCap = this.effectiveDailyCap(usage);
    return {
      queued: session.queue.length + session.bulkQueue.length,
      sent: m.sent,
      delivered: m.delivered,
      read: m.read,
      failed: m.failed,
      reconnects: m.reconnects,
      usedToday: usage.day,
      dailyCap,
      usedThisHour: usage.hour,
      hourlyCap: Math.max(1, Math.min(config.whatsapp.hourlySendCap, dailyCap)),
      cooldownUntil:
        session.cooldownUntil && session.cooldownUntil > Date.now()
          ? new Date(session.cooldownUntil).toISOString()
          : undefined,
      skippedDuplicates: m.skippedDuplicates,
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
        queued: (session?.queue.length ?? 0) + (session?.bulkQueue.length ?? 0),
        reconnects: session?.metrics.reconnects ?? 0,
        lastSentAt: session?.metrics.lastSentAt ? new Date(session.metrics.lastSentAt).toISOString() : undefined,
      },
    };
  }

  /**
   * Cancel every send still waiting in this school's queue and drop the cached
   * sent-message bodies. Use this the moment a broadcast needs to stop: without
   * it a queued run keeps trickling out ≈1 message/min for hours (only a server
   * restart cleared it), which is the worst thing to be doing while a number is
   * already under scrutiny. The link itself is untouched.
   */
  cancelPending(schoolId: string): { cancelled: number; cacheCleared: number } {
    const session = this.sessions.get(schoolId);
    if (!session) return { cancelled: 0, cacheCleared: 0 };

    const pending = [...session.queue.splice(0), ...session.bulkQueue.splice(0)];
    pending.forEach((task) => task.reject(new Error('Send cancelled by an administrator')));

    const cacheCleared = session.sentMessages.size;
    session.sentMessages.clear();
    // Drop both throttle cursors too, so the next deliberate send isn't stuck
    // behind slots reserved by messages that no longer exist.
    session.nextSlotAt = 0;
    session.nextBulkSlotAt = 0;

    return { cancelled: pending.length, cacheCleared };
  }

  /** Disconnect and permanently remove the linked number's credentials. */
  async logout(schoolId: string): Promise<void> {
    const session = this.sessions.get(schoolId);
    if (session) {
      this.clearRelinkRequired(schoolId, session);
      // Cancel a pending reconnect so it can't resurrect the just-unlinked number.
      if (session.reconnectTimer) {
        clearTimeout(session.reconnectTimer);
        session.reconnectTimer = undefined;
      }
      // Fail any queued sends rather than leaving their callers hanging forever.
      const pending = [...session.queue.splice(0), ...session.bulkQueue.splice(0)];
      pending.forEach((task) => task.reject(new Error('WhatsApp was disconnected')));
    }
    try {
      await session?.sock?.logout();
    } catch {
      /* socket may already be dead — ignore */
    }
    await this.clearAuth(schoolId);
    this.sessions.delete(schoolId);
    // A different number may be linked next; drop the cached volume/warm-up
    // state so it is re-seeded (and re-ramped) for whoever links after this.
    this.usage.delete(schoolId);
    // Explicit disconnect: forget the number too.
    await this.persistNumber(schoolId, null);
  }

  // ── Sending ──────────────────────────────────────────────────────────────

  /** Send a plain-text message to a single recipient. */
  async sendText(schoolId: string, to: string, text: string, bulk = false): Promise<string | undefined> {
    // Bulk → queue and return at once; interactive → send and wait for the id.
    if (bulk) { this.enqueue(schoolId, to, { text }); return undefined; }
    return this.send(schoolId, to, { text }, false);
  }

  /**
   * Send media (image / video / audio / document) to a single recipient.
   * The media is supplied either as a public `url` or as a base64 `data` string.
   */
  async sendMedia(schoolId: string, req: SendMediaRequest): Promise<string | undefined> {
    const content = this.buildMediaContent(schoolId, req);

    // Bulk media (e.g. "Send All" demand-bill PDFs) → queue and return at once,
    // so the request never times out waiting on the ≈1-min bulk pacing.
    if (req.bulk) { this.enqueue(schoolId, req.to, content); return undefined; }
    return this.send(schoolId, req.to, content, false);
  }

  /**
   * Turn a media request into Baileys message content. The source is one of:
   *   - `mediaId`  — a file uploaded to `POST /whatsapp/media` (the file-sharing
   *                  path: upload once, send to a whole class)
   *   - `url`      — a publicly reachable link
   *   - `data`     — base64 bytes inline
   *
   * With a `mediaId` the file's real name and MIME type come from the upload, so
   * a document arrives as "Fee-Receipt-May.pdf" rather than "document".
   */
  buildMediaContent(schoolId: string, req: Omit<SendMediaRequest, 'to'>): AnyMessageContent {
    // `data` / `caption` are used as given; the rest are filled in from the
    // uploaded file below when only a mediaId was supplied.
    const { data, caption } = req;
    let { mediaType, url, filename, mimetype } = req;

    // Uploaded attachment: fill in everything we already know about the file.
    if (req.mediaId) {
      const stored = resolveMedia(schoolId, req.mediaId);
      url = stored.filePath; // Baileys streams a local path the same as a URL
      mediaType = mediaType || stored.mediaType;
      filename = filename || stored.filename;
      mimetype = mimetype || stored.mimetype;
    }

    if (!url && !data) throw new Error('Provide "mediaId", "url" or base64 "data"');
    if (!mediaType) mediaType = mimetype ? inferMediaType(mimetype) : 'document';

    // Baileys media accepts a `{ url }` object (remote or local path) or a Buffer.
    const media: { url: string } | Buffer = url ? { url } : Buffer.from(data as string, 'base64');

    switch (mediaType) {
      case 'image':
        return { image: media as any, caption };
      case 'video':
        return { video: media as any, caption };
      case 'audio':
        return { audio: media as any, mimetype: mimetype || 'audio/mp4' };
      case 'document':
        return {
          document: media as any,
          caption,
          fileName: filename || 'document',
          mimetype: mimetype || 'application/octet-stream',
        };
      default:
        throw new Error(`Unsupported media type: ${mediaType}`);
    }
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

    // Latched for relinking → fail permanently so the queue drops the message
    // instead of retrying it into a socket that must not be started.
    if (session.requiresRelink) {
      throw this.permanent(session.lastError || 'WhatsApp must be relinked before sending.');
    }
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

  /**
   * Resolve a recipient JID to the one WhatsApp actually knows, and refuse to
   * send if the number has no WhatsApp account.
   *
   * This is the fix for "it says connected but messages never arrive":
   * `sendMessage` to an unregistered number resolves normally and returns a
   * message id, so the send was counted as successful and the operator had no
   * signal that nothing was delivered. `onWhatsApp` is also what tells us the
   * canonical JID — WhatsApp may key an account under a different id than the
   * plain `<digits>@s.whatsapp.net` we build, and sending to the wrong id is
   * likewise accepted-then-dropped.
   *
   * Lookups are cached per session (bounded, TTL'd) so a broadcast to the same
   * class doesn't re-query for every message.
   *
   * FAIL-OPEN BY DESIGN: only an explicit `exists: false` blocks a send. A
   * missing/empty/timed-out lookup means "no answer", not "no account", and
   * must let the message through — blocking sends on an inconclusive diagnostic
   * is strictly worse than the silent-drop it was meant to catch.
   */
  private async resolveRecipient(session: Session, jid: string): Promise<string> {
    if (!config.whatsapp.verifyRecipient) return jid;
    // Groups aren't lookup-able this way; nothing to verify.
    if (isJidGroup(jid)) return jid;

    const cached = session.jidChecks.get(jid);
    if (cached && Date.now() - cached.at < JID_CHECK_TTL_MS) {
      if (!cached.exists) throw this.permanent(this.notOnWhatsAppMessage(jid));
      return cached.jid;
    }

    let results: Array<{ jid: string; exists: unknown; lid?: unknown }> | undefined;
    try {
      // onWhatsApp issues a USync query; bound it so a stalled query can never
      // hold up the send queue.
      results = (await Promise.race([
        session.sock!.onWhatsApp(jid),
        sleep(JID_CHECK_TIMEOUT_MS).then(() => undefined),
      ])) as any;
    } catch {
      // Lookup unavailable (socket mid-handshake, rate limited) — don't turn a
      // diagnostic failure into a send failure.
      return jid;
    }

    // CRITICAL: `undefined` / `[]` mean the lookup gave us NO ANSWER (no USync
    // response, timeout, socket not ready) — NOT "this number has no WhatsApp".
    // Treating those as a negative rejects every send while the socket is
    // otherwise perfectly healthy. Only an explicit `exists: false` entry is a
    // real negative; anything else is inconclusive and must let the send through.
    if (!results || results.length === 0) {
      console.warn(
        `[whatsapp] recipient check INCONCLUSIVE for ${jid} ` +
        `(${results ? 'empty result' : 'no response'}) — sending anyway`
      );
      return jid;
    }

    const hit = results.find((r) => r?.jid) ?? results[0];
    const exists = Boolean(hit?.exists);

    // WhatsApp is migrating accounts from phone-number JIDs to `<id>@lid`, and
    // `onWhatsApp` hands back both. WHICH ONE WE ADDRESS DECIDES WHETHER THE
    // MESSAGE ARRIVES, and the right answer depends on the Baileys version:
    //
    //   Baileys 6.x (this build) — sending TO an `@lid` address is not
    //   supported. The socket accepts it, returns a message id, and the stanza
    //   is never delivered: no server ack, no delivery ack, nothing. Observed
    //   directly (id=3EB0308BBCEF465C2186CA to 85031796134096@lid, zero acks),
    //   which is the worst failure mode there is — the UI says "sent".
    //
    //   Baileys 7.x — LID addressing is supported, and a recipient who has
    //   migrated must be addressed by LID or the ack comes back as error 463.
    //
    // So: address the phone JID by default, and keep the LID as the fallback
    // for when there is no phone JID. WHATSAPP_PREFER_LID=true flips it, for
    // after a Baileys 7 upgrade or if a 463 ever reappears.
    const lid = typeof hit?.lid === 'string' ? hit.lid : '';
    const phoneJid = (hit?.jid as string) || '';
    const resolved = (config.whatsapp.preferLid ? lid || phoneJid : phoneJid || lid) || jid;

    // Only definite answers are worth caching.
    session.jidChecks.set(jid, { jid: resolved, exists, at: Date.now() });
    while (session.jidChecks.size > JID_CHECK_LIMIT) {
      const oldest = session.jidChecks.keys().next().value;
      if (oldest === undefined) break;
      session.jidChecks.delete(oldest);
    }

    console.log(
      `[whatsapp] recipient check ${jid} -> exists=${exists} lid=${lid || 'none'} resolved=${resolved}`
    );
    if (!exists) throw this.permanent(this.notOnWhatsAppMessage(jid));
    return resolved;
  }

  private notOnWhatsAppMessage(jid: string): string {
    const number = jid.split('@')[0];
    return `${number} is not registered on WhatsApp — check the number (it needs a country code, e.g. 91XXXXXXXXXX).`;
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
    content: AnyMessageContent,
    bulk = false
  ): Promise<string | undefined> {
    // Validate the recipient synchronously so bad numbers fail fast (and never
    // occupy a queue slot / burn a throttle delay).
    const jid = this.toJid(to);
    const session = this.getOrInit(schoolId);

    return new Promise<string | undefined>((resolve, reject) => {
      const task: QueueTask = { jid, content, attempts: 0, bulk, resolve, reject };
      // Interactive and bulk go to separate queues with separate workers, so a
      // single receipt never waits on the bulk lane's ≈1-min pacing.
      if (bulk) session.bulkQueue.push(task);
      else session.queue.push(task);
      this.ensureWorkers(schoolId, session);
    });
  }

  /**
   * Fire-and-forget enqueue: queues a bulk send and returns immediately instead
   * of holding the HTTP request until it lands. With ≈1-min bulk spacing a whole
   * class would otherwise hold the request for many minutes and trip the client
   * / proxy timeout (which is exactly why bulk "failed"). The queue paces and
   * retries in the background; outcomes are recorded in the session metrics.
   */
  private enqueue(schoolId: string, to: string, content: AnyMessageContent): void {
    // send() validates the number synchronously (throws for a bad one) before
    // queuing; we deliberately don't await the returned promise.
    void this.send(schoolId, to, content, true).catch(() => { /* tracked in metrics */ });
  }

  /**
   * Queue the same content to many recipients (fire-and-forget). Returns the
   * count accepted onto the queue right away; the send itself happens in the
   * background, one message ≈every minute.
   */
  enqueueBulk(schoolId: string, recipients: string[], content: AnyMessageContent): { queued: number; invalid: number } {
    let queued = 0;
    let invalid = 0;
    // Randomize the order. A broadcast that walks the class register in exact
    // roll-number order (which is also phone-book order) is a machine-obvious
    // pattern; shuffling costs nothing and removes it.
    for (const to of this.shuffled(recipients)) {
      try {
        // Vary the wording per recipient when the author wrote spintax. Hundreds
        // of byte-identical messages from one number is a strong spam signal —
        // "{Dear|Hello} {{name}}" quietly breaks that up.
        this.enqueue(schoolId, to, this.varyContent(content));
        queued += 1;
      } catch {
        invalid += 1; // rejected synchronously (e.g. not a valid number)
      }
    }
    return { queued, invalid };
  }

  /** Fisher–Yates on a copy — never reorders the caller's array. */
  private shuffled<T>(items: T[]): T[] {
    const copy = [...items];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** Apply spintax to whichever text field this content carries. */
  private varyContent(content: AnyMessageContent): AnyMessageContent {
    const text = (content as any)?.text;
    if (typeof text === 'string' && text.includes('{')) {
      return { ...(content as any), text: expandSpintax(text) };
    }
    const caption = (content as any)?.caption;
    if (typeof caption === 'string' && caption.includes('{')) {
      return { ...(content as any), caption: expandSpintax(caption) };
    }
    return content;
  }

  /**
   * Cache a sent message's content by id so `getMessage` can replay it for a
   * retry receipt. Bounded and FIFO-evicted so a long-running process with many
   * broadcasts never grows this map without limit.
   */
  private rememberSentMessage(session: Session, id: string, content: WAMessageContent): void {
    session.sentMessages.set(id, content);
    while (session.sentMessages.size > SENT_CACHE_LIMIT) {
      const oldest = session.sentMessages.keys().next().value;
      if (oldest === undefined) break;
      session.sentMessages.delete(oldest);
    }
  }

  /**
   * Spin up drain workers: up to `sendConcurrency` for the interactive lane,
   * plus one dedicated worker for the bulk lane. The bulk worker is separate on
   * purpose — while it sleeps out its ≈1-min gap it must not hold the only
   * worker and stall interactive sends.
   */
  private ensureWorkers(schoolId: string, session: Session): void {
    const target = Math.max(1, config.whatsapp.sendConcurrency || 1);
    while (session.activeWorkers < target && session.queue.length > 0) {
      session.activeWorkers += 1;
      void this.drainWorker(schoolId, session, false);
    }
    if (!session.bulkWorkerActive && session.bulkQueue.length > 0) {
      session.bulkWorkerActive = true;
      void this.drainWorker(schoolId, session, true);
    }
  }

  private async drainWorker(schoolId: string, session: Session, bulk: boolean): Promise<void> {
    const lane = () => (bulk ? session.bulkQueue : session.queue);
    try {
      for (;;) {
        const task = lane().shift();
        if (!task) break;
        await this.processTask(schoolId, session, task);
      }
    } finally {
      if (bulk) session.bulkWorkerActive = false;
      else session.activeWorkers -= 1;
    }
  }

  /**
   * Send one queued message: wait for its randomized throttle slot, ensure the
   * socket is live, then send — retrying transient failures with exponential
   * backoff. A single bad recipient can never wedge the queue: it either
   * succeeds, exhausts its retries, or is rejected, and the worker moves on.
   */
  private async processTask(schoolId: string, session: Session, task: QueueTask): Promise<void> {
    await this.awaitSendSlot(session, task.bulk);

    for (;;) {
      try {
        // Volume caps, quiet hours and the failure circuit-breaker are checked
        // before every attempt — a message that has been sitting in the queue
        // for an hour must obey the limits in force NOW, not when it was queued.
        await this.awaitQuota(schoolId, session, !!task.bulk);

        // Drop an exact repeat of a very recent broadcast to the same number.
        if (task.bulk && this.isDuplicate(session, task.jid, task.content)) {
          session.metrics.skippedDuplicates += 1;
          console.warn(`[whatsapp] duplicate skipped school=${schoolId} to=${task.jid}`);
          task.resolve(undefined);
          return;
        }

        const live = await this.ensureConnected(schoolId);
        // Resolve/verify the recipient BEFORE sending. Baileys happily accepts a
        // JID with no WhatsApp account behind it and returns a message id, so
        // without this the send is counted as sent and silently delivers nothing.
        const jid = await this.resolveRecipient(live, task.jid);
        await this.simulateTyping(live.sock!, jid, task.content);
        const sent = await live.sock!.sendMessage(jid, task.content);
        // Keep the encrypted content around so a retry receipt can be answered
        // (see the `getMessage` handler) — otherwise the recipient is stuck on
        // "Waiting for this message" whenever the first delivery fails to decrypt.
        if (sent?.key?.id && sent.message) {
          this.rememberSentMessage(session, sent.key.id, sent.message);
        }
        session.metrics.sent += 1;
        session.metrics.lastSentAt = Date.now();
        session.consecutiveFailures = 0; // a success clears the breaker's streak
        this.noteSent(schoolId);
        this.bumpStat(schoolId, 'sent');
        console.log(
          `[whatsapp] sent school=${schoolId} to=${jid} lane=${task.bulk ? 'bulk' : 'interactive'} id=${sent?.key?.id ?? 'n/a'}`
        );
        task.resolve(sent?.key?.id ?? undefined);
        return;
      } catch (error: any) {
        task.attempts += 1;
        // A rate-limit / failure streak parks the whole account. Recipient-level
        // problems ("not on WhatsApp") are permanent for that message only and
        // must not count toward the breaker.
        if (!error?.permanent) this.noteFailure(schoolId, session, error);
        // Permanent conditions (not linked / link expired) can't be retried away.
        if (error?.permanent || task.attempts > Math.max(0, config.whatsapp.sendRetries)) {
          session.metrics.failed += 1;
          this.bumpStat(schoolId, 'failed');
          // A failed send used to be invisible outside a counter, which made
          // "it says connected but nothing arrives" undiagnosable. Say why.
          const reason = error?.message || 'unknown error';
          session.lastError = `Send to ${task.jid} failed: ${reason}`;
          console.error(
            `[whatsapp] send FAILED school=${schoolId} to=${task.jid} ` +
            `lane=${task.bulk ? 'bulk' : 'interactive'} attempts=${task.attempts} ` +
            `permanent=${Boolean(error?.permanent)} reason=${reason}`
          );
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
   * a RANDOM gap apart; a lone send after an idle period goes out immediately
   * because the slot cursor is already past. Interactive sends use the fast
   * range (default 3–10s); bulk / broadcast sends use the wide range (≈1 min)
   * so a large run never trips WhatsApp's rate limits.
   */
  private async awaitSendSlot(session: Session, bulk = false): Promise<void> {
    const min = Math.max(0, bulk ? config.whatsapp.bulkMinSendDelayMs : config.whatsapp.minSendDelayMs);
    const max = Math.max(min, bulk ? config.whatsapp.bulkMaxSendDelayMs : config.whatsapp.maxSendDelayMs);
    const gap = randomBetween(min, max);

    // Separate cursors per lane: a bulk run reserving minute-wide slots must not
    // push interactive sends into the future.
    const now = Date.now();
    const cursor = bulk ? session.nextBulkSlotAt : session.nextSlotAt;
    const slot = Math.max(now, cursor);
    if (bulk) session.nextBulkSlotAt = slot + gap;
    else session.nextSlotAt = slot + gap;

    const wait = slot - now;
    if (wait > 0) await sleep(wait);
  }

  // ── Volume caps, warm-up and the circuit breaker ──────────────────────────

  private usageFor(schoolId: string): SendUsage {
    const dayKey = startOfUTCDay().toISOString().slice(0, 10);
    const hourKey = `${dayKey}T${new Date().getUTCHours()}`;

    let usage = this.usage.get(schoolId);
    if (!usage) {
      usage = { dayKey, day: 0, hourKey, hour: 0, seeded: false };
      this.usage.set(schoolId, usage);
    }
    // Roll the buckets over at midnight / on the hour.
    if (usage.dayKey !== dayKey) {
      usage.dayKey = dayKey;
      usage.day = 0;
      usage.seeded = true; // a new day starts genuinely empty
    }
    if (usage.hourKey !== hourKey) {
      usage.hourKey = hourKey;
      usage.hour = 0;
    }
    return usage;
  }

  /**
   * Seed today's counter from the durable stats table the first time this
   * school sends in a given process. Without it, a restart (or a deploy) would
   * reset the daily allowance and let a number send several times its cap.
   */
  private async ensureUsageSeeded(schoolId: string): Promise<SendUsage> {
    const usage = this.usageFor(schoolId);
    if (!usage.seeded) {
      usage.seeded = true; // set first: concurrent callers must not double-seed
      const store = this.statStore();
      if (store) {
        try {
          const row = await store.findUnique({
            where: { schoolId_date: { schoolId, date: startOfUTCDay() } },
            select: { sent: true },
          });
          if (row?.sent) usage.day = Math.max(usage.day, row.sent);
        } catch {
          /* stats table may not be migrated — fall back to this process's count */
        }
      }
    }

    if (!usage.linkedAtLoaded) {
      usage.linkedAtLoaded = true;
      try {
        const school = await db.school.findUnique({
          where: { id: schoolId },
          select: { whatsappLinkedAt: true },
        });
        usage.linkedAt = school?.whatsappLinkedAt ? new Date(school.whatsappLinkedAt).getTime() : undefined;
      } catch {
        /* no linked-at recorded — treat the number as fully warmed up */
      }
    }

    return usage;
  }

  /**
   * Today's effective daily cap. A number linked less than `warmupDays` ago
   * gets a reduced allowance that ramps up day by day: brand-new links that
   * immediately blast hundreds of messages are the ones WhatsApp blocks
   * fastest, and the ramp is what a real school's adoption looks like anyway.
   */
  private effectiveDailyCap(usage: SendUsage): number {
    const full = Math.max(1, config.whatsapp.dailySendCap);
    const warmupDays = Math.max(0, config.whatsapp.warmupDays);
    const start = Math.max(1, Math.min(config.whatsapp.warmupStartCap, full));
    if (!warmupDays || !usage.linkedAt) return full;

    const daysLinked = Math.floor((Date.now() - usage.linkedAt) / 86_400_000);
    if (daysLinked >= warmupDays) return full;
    // Day 0 → start, day `warmupDays` → full, linear in between.
    return Math.round(start + ((full - start) * daysLinked) / warmupDays);
  }

  /**
   * Gate one send on the account's caps and its circuit breaker. Returns once
   * the send may proceed; throws a permanent error when it may not happen today.
   *
   * Hourly exhaustion PARKS the message (the worker waits for the next hour)
   * rather than failing it — a broadcast bigger than one hour's allowance still
   * completes, just spread out. Daily exhaustion fails it, because holding a
   * message until tomorrow would silently deliver a "school is closed today"
   * notice a day late.
   */
  private async awaitQuota(schoolId: string, session: Session, bulk: boolean): Promise<void> {
    for (;;) {
      // 1. Circuit breaker — nothing goes out while the account is parked.
      const cooldown = session.cooldownUntil ?? 0;
      if (cooldown > Date.now()) {
        if (!bulk) {
          throw this.permanent(
            `WhatsApp sending is paused until ${new Date(cooldown).toLocaleTimeString()} after repeated failures — this protects the number from being blocked.`
          );
        }
        await sleep(Math.min(cooldown - Date.now(), 60_000));
        continue;
      }
      if (cooldown && cooldown <= Date.now()) session.cooldownUntil = undefined;

      // 2. Quiet hours (bulk only, opt-in).
      const quietWait = bulk ? this.quietHoursWait() : 0;
      if (quietWait > 0) {
        session.lastError = `Broadcast paused for quiet hours — resumes in ${Math.round(quietWait / 60000)} min`;
        await sleep(Math.min(quietWait, 5 * 60_000));
        continue;
      }

      // 3. Volume caps.
      const usage = await this.ensureUsageSeeded(schoolId);
      const dailyCap = this.effectiveDailyCap(usage);
      if (usage.day >= dailyCap) {
        throw this.permanent(
          `Daily WhatsApp limit reached (${usage.day}/${dailyCap} messages). Sending resumes after midnight UTC — this cap is what keeps the number from being blocked.`
        );
      }

      const hourlyCap = Math.max(1, Math.min(config.whatsapp.hourlySendCap, dailyCap));
      if (usage.hour >= hourlyCap) {
        const msToNextHour = 3_600_000 - (Date.now() % 3_600_000);
        if (!bulk) {
          throw this.permanent(
            `Hourly WhatsApp limit reached (${usage.hour}/${hourlyCap}). Try again in ${Math.ceil(msToNextHour / 60000)} min.`
          );
        }
        session.lastError = `Hourly limit reached (${hourlyCap}/h) — broadcast resumes in ${Math.ceil(msToNextHour / 60000)} min`;
        await sleep(Math.min(msToNextHour + 1000, 5 * 60_000));
        continue;
      }

      return;
    }
  }

  /** Milliseconds until quiet hours end, or 0 when sending is allowed now. */
  private quietHoursWait(): number {
    const start = config.whatsapp.quietStartHour;
    const end = config.whatsapp.quietEndHour;
    if (start === null || end === null || start === end) return 0;
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;

    const now = new Date();
    const hour = now.getHours();
    // The window may wrap past midnight (e.g. 21 → 8).
    const inQuiet = start < end ? hour >= start && hour < end : hour >= start || hour < end;
    if (!inQuiet) return 0;

    const resume = new Date(now);
    resume.setHours(end as number, 0, 0, 0);
    if (resume.getTime() <= now.getTime()) resume.setDate(resume.getDate() + 1);
    return resume.getTime() - now.getTime();
  }

  /** Count a message against the caps (called only on a successful send). */
  private noteSent(schoolId: string): void {
    const usage = this.usageFor(schoolId);
    usage.day += 1;
    usage.hour += 1;
  }

  /**
   * Trip the breaker when the account looks throttled. WhatsApp's rate-limit
   * errors and a run of consecutive failures both mean "back off now"; retrying
   * straight through either is what escalates into a block.
   */
  private noteFailure(schoolId: string, session: Session, error: any): void {
    session.consecutiveFailures += 1;

    const text = String(error?.message || '').toLowerCase();
    const statusCode = error?.output?.statusCode ?? error?.data ?? 0;
    const rateLimited =
      statusCode === 429 ||
      text.includes('rate-overlimit') ||
      text.includes('rate limit') ||
      text.includes('too many');

    const threshold = Math.max(1, config.whatsapp.failureCooldownAfter);
    if (!rateLimited && session.consecutiveFailures < threshold) return;

    const until = Date.now() + Math.max(60_000, config.whatsapp.cooldownMs);
    session.cooldownUntil = until;
    session.lastError = rateLimited
      ? `WhatsApp rate-limited this number — sending paused until ${new Date(until).toLocaleTimeString()}`
      : `${session.consecutiveFailures} sends failed in a row — sending paused until ${new Date(until).toLocaleTimeString()}`;
    console.warn(`[whatsapp] cooldown school=${schoolId} until=${new Date(until).toISOString()} reason=${rateLimited ? 'rate-limit' : 'failure-streak'}`);
  }

  /**
   * Show "typing…" (or "recording…") to the recipient for a beat before the
   * message lands. A stream of messages with no presence activity at all is one
   * of the cheaper automation tells; this costs nothing and removes it.
   */
  private async simulateTyping(sock: WASocket, jid: string, content: AnyMessageContent): Promise<void> {
    if (!config.whatsapp.simulateTyping) return;
    const text = (content as any)?.text ?? (content as any)?.caption ?? '';
    const kind = (content as any)?.audio ? 'recording' : 'composing';
    // Roughly a human typing speed, clamped so a long notice doesn't stall the
    // queue and a one-word reply still pauses believably.
    const think = Math.min(4000, Math.max(700, String(text).length * 35));
    try {
      await sock.presenceSubscribe(jid);
      await sock.sendPresenceUpdate(kind, jid);
      await sleep(randomBetween(Math.round(think * 0.6), think));
      await sock.sendPresenceUpdate('paused', jid);
    } catch {
      /* presence is cosmetic — never let it block the actual send */
    }
  }

  /**
   * Bulk de-duplication: drop a message that repeats the exact same content to
   * the same number within the configured window. Double-submitted broadcasts
   * used to message every parent twice minutes apart, which is precisely the
   * pattern recipients report as spam.
   */
  private isDuplicate(session: Session, jid: string, content: AnyMessageContent): boolean {
    const window = Math.max(0, config.whatsapp.duplicateWindowMs);
    if (!window) return false;

    const body =
      (content as any)?.text ??
      `${(content as any)?.caption ?? ''}|${(content as any)?.fileName ?? ''}|${
        (content as any)?.image?.url ?? (content as any)?.document?.url ?? (content as any)?.video?.url ?? ''
      }`;
    const key = `${jid}|${crypto.createHash('sha1').update(String(body)).digest('hex')}`;

    const now = Date.now();
    const last = session.recentSends.get(key);
    if (last && now - last < window) return true;

    session.recentSends.set(key, now);
    // Bounded + swept: keep only entries still inside the window.
    if (session.recentSends.size > 5000) {
      for (const [k, at] of session.recentSends) {
        if (now - at >= window) session.recentSends.delete(k);
      }
    }
    return false;
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
