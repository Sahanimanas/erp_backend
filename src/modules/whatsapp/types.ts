export type SessionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WhatsAppSessionState {
  status: SessionStatus;
  /** QR as a PNG data-URL — present only while status === 'qr'. */
  qr?: string;
  /** Linked number once connected (country code + number, digits only). */
  number?: string;
  lastError?: string;
  /** Live send-queue / delivery health for monitoring dashboards. */
  health?: WhatsAppHealth;
  /**
   * WhatsApp logged this number out (or reconnects were exhausted). Nothing will
   * auto-reconnect until an admin deliberately relinks — repeatedly
   * re-registering a number is itself a ban signal.
   */
  requiresRelink?: boolean;
}

export interface WhatsAppHealth {
  /** Messages waiting in this account's serial send queue. */
  queued: number;
  /** Messages sent by this number today, against the anti-ban daily cap. */
  usedToday: number;
  /** Today's effective cap (reduced while a freshly linked number warms up). */
  dailyCap: number;
  /** Messages sent in the current clock hour, against the hourly cap. */
  usedThisHour: number;
  hourlyCap: number;
  /** Set while the account is parked after repeated failures / a rate limit. */
  cooldownUntil?: string;
  /** Bulk sends dropped because they repeated a recent identical message. */
  skippedDuplicates: number;
  /** Total accepted by the WhatsApp server since the socket came up. */
  sent: number;
  /** Delivered acknowledgements received (double tick). */
  delivered: number;
  /** Read acknowledgements received (blue tick). */
  read: number;
  /** Sends that exhausted their retries, or messages the server rejected. */
  failed: number;
  /** How many times the socket has auto-reconnected since it was linked. */
  reconnects: number;
  /** ISO timestamp of the last successful send (server-accepted). */
  lastSentAt?: string;
}

export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface SendTextRequest {
  to: string;
  message: string;
  /** Pace this send with the wide bulk delay (≈1 min) instead of the fast one. */
  bulk?: boolean;
}

export interface SendMediaRequest {
  to: string;
  /** May be omitted when `mediaId` is given — it is inferred from the file. */
  mediaType?: MediaType;
  /** Id returned by `POST /whatsapp/media` — the file-sharing path. */
  mediaId?: string;
  /** Public URL of the media. Mutually exclusive with `data`. */
  url?: string;
  /** Base64-encoded media bytes. Mutually exclusive with `url`. */
  data?: string;
  caption?: string;
  /** File name shown for documents. */
  filename?: string;
  /** MIME type (required for audio/document when sending raw bytes). */
  mimetype?: string;
  /** Pace this send with the wide bulk delay (≈1 min) instead of the fast one. */
  bulk?: boolean;
}

export interface SendBulkRequest {
  recipients: string[];
  message?: string;
  media?: Omit<SendMediaRequest, 'to'>;
}
