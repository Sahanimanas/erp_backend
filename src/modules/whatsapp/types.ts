export type SessionStatus = 'disconnected' | 'connecting' | 'qr' | 'connected';

export interface WhatsAppSessionState {
  status: SessionStatus;
  /** QR as a PNG data-URL — present only while status === 'qr'. */
  qr?: string;
  /** Linked number once connected (country code + number, digits only). */
  number?: string;
  lastError?: string;
}

export type MediaType = 'image' | 'video' | 'audio' | 'document';

export interface SendTextRequest {
  to: string;
  message: string;
}

export interface SendMediaRequest {
  to: string;
  mediaType: MediaType;
  /** Public URL of the media. Mutually exclusive with `data`. */
  url?: string;
  /** Base64-encoded media bytes. Mutually exclusive with `url`. */
  data?: string;
  caption?: string;
  /** File name shown for documents. */
  filename?: string;
  /** MIME type (required for audio/document when sending raw bytes). */
  mimetype?: string;
}

export interface SendBulkRequest {
  recipients: string[];
  message?: string;
  media?: Omit<SendMediaRequest, 'to'>;
}
