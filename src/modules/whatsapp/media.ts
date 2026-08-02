import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import { config } from '@config/environment';
import type { MediaType } from './types';

/**
 * Attachment store for WhatsApp file sharing.
 *
 * The flow mirrors the standard WhatsApp Cloud API shape (and the
 * Super-Light-Web-WhatsApp-API-Server's `/media` → `/messages` pair): upload the
 * file ONCE to get a `mediaId`, then reference that id when sending. This is
 * what makes broadcasting a 20 MB fee-demand PDF to a whole class practical —
 * the browser uploads it once instead of base64-inlining it into every request.
 *
 * Files live under `mediaDir/<schoolId>/<id><ext>`, so one school can never read
 * or send another school's attachment even if it guesses the id.
 */

/**
 * Extension → MIME, for the types WhatsApp actually renders well. Anything not
 * on this list is rejected at upload: an unknown/executable attachment is both a
 * security risk and the sort of thing that gets a number reported.
 */
const ALLOWED: Record<string, string> = {
  // images
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  // video
  '.mp4': 'video/mp4',
  '.3gp': 'video/3gpp',
  '.mkv': 'video/x-matroska',
  // audio / voice notes
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  // documents
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.csv': 'text/csv',
  '.txt': 'text/plain',
  '.zip': 'application/zip',
};

export interface StoredMedia {
  /** Opaque id handed back to the client and quoted when sending. */
  mediaId: string;
  /** Absolute path on disk — passed to Baileys as `{ url: <path> }`. */
  filePath: string;
  /** Original file name, shown to the recipient for documents. */
  filename: string;
  mimetype: string;
  /** Which WhatsApp message kind this file should be sent as. */
  mediaType: MediaType;
  size: number;
}

/** Map a MIME type to the WhatsApp message kind that renders it natively. */
export function inferMediaType(mimetype: string): MediaType {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  return 'document';
}

function schoolDir(schoolId: string): string {
  // schoolId comes from the JWT, never from the request body — but keep the
  // basename guard so a crafted token can't escape the media root.
  return path.join(config.whatsapp.mediaDir, path.basename(schoolId));
}

/**
 * Sidecar metadata (original name + MIME). Kept next to the file rather than in
 * the DB so file sharing needs no migration, and so deleting the directory
 * cleans up everything at once.
 */
function metaPath(filePath: string): string {
  return `${filePath}.json`;
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const schoolId = (req as any).user?.schoolId;
    if (!schoolId) return cb(new Error('Authentication required'), '');
    const dir = schoolDir(schoolId);
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (err: any) {
      cb(err, '');
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/**
 * Multer middleware for `POST /whatsapp/media`. Both the extension and the
 * browser-reported MIME type must agree with the allow-list.
 */
export const uploadMedia = multer({
  storage,
  limits: { fileSize: config.whatsapp.mediaMaxBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const expected = ALLOWED[ext];
    if (!expected) {
      return cb(new Error(`File type "${ext || 'unknown'}" is not allowed. Allowed: ${Object.keys(ALLOWED).join(', ')}`));
    }
    // Browsers occasionally send a generic type for known extensions; trust the
    // extension in that case, but reject an outright mismatch (e.g. .pdf sent
    // as image/png).
    const reported = (file.mimetype || '').toLowerCase();
    const generic = !reported || reported === 'application/octet-stream';
    if (!generic && reported !== expected && reported.split('/')[0] !== expected.split('/')[0]) {
      return cb(new Error(`File content type ${reported} does not match "${ext}"`));
    }
    cb(null, true);
  },
});

/** Record the original filename/MIME for an uploaded file and describe it. */
export function registerUpload(schoolId: string, file: Express.Multer.File): StoredMedia {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimetype = ALLOWED[ext] || file.mimetype || 'application/octet-stream';
  const stored: StoredMedia = {
    mediaId: file.filename,
    filePath: file.path,
    filename: path.basename(file.originalname),
    mimetype,
    mediaType: inferMediaType(mimetype),
    size: file.size,
  };

  try {
    fs.writeFileSync(
      metaPath(file.path),
      JSON.stringify({ filename: stored.filename, mimetype, uploadedAt: new Date().toISOString() }),
      'utf8'
    );
  } catch {
    /* the file is still sendable — only the original name would be lost */
  }

  sweepOldMedia(schoolId);
  return stored;
}

/**
 * Look up a previously uploaded attachment for this school.
 * Throws if the id is malformed, belongs to another school, or has been swept.
 */
export function resolveMedia(schoolId: string, mediaId: string): StoredMedia {
  const safe = path.basename(String(mediaId || ''));
  if (!safe || safe !== mediaId) throw new Error('Invalid mediaId');

  const filePath = path.join(schoolDir(schoolId), safe);
  if (!fs.existsSync(filePath)) {
    throw new Error('Attachment not found — it may have expired. Upload the file again.');
  }

  const ext = path.extname(safe).toLowerCase();
  let filename = safe;
  let mimetype = ALLOWED[ext] || 'application/octet-stream';
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath(filePath), 'utf8'));
    if (meta.filename) filename = meta.filename;
    if (meta.mimetype) mimetype = meta.mimetype;
  } catch {
    /* sidecar missing — fall back to the stored name and extension */
  }

  return {
    mediaId: safe,
    filePath,
    filename,
    mimetype,
    mediaType: inferMediaType(mimetype),
    size: fs.statSync(filePath).size,
  };
}

/**
 * Delete this school's attachments older than the retention window. Called
 * opportunistically on upload — a queued broadcast only needs its file for a few
 * hours, so anything week-old is finished with.
 */
export function sweepOldMedia(schoolId: string): void {
  const days = Math.max(1, config.whatsapp.mediaRetentionDays);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const dir = schoolDir(schoolId);
  try {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      try {
        if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { force: true });
      } catch {
        /* skip files that vanish mid-sweep */
      }
    }
  } catch {
    /* nothing uploaded yet */
  }
}

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED);
