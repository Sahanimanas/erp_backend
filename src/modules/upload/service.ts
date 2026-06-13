import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import config from '@config/environment';

/**
 * Upload service backed by Cloudflare R2 (S3-compatible object storage).
 *
 * Endpoints stay the same (POST /uploads/image, /uploads/file); each takes a
 * base64 data URI (or an already-hosted http(s) URL) and returns a public URL.
 * The client is created lazily so the server still boots when R2 is unconfigured
 * — the endpoint then returns a clear "not configured" error.
 */

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.storage.r2.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.storage.r2.accessKeyId as string,
        secretAccessKey: config.storage.r2.secretAccessKey as string,
      },
    });
  }
  return client;
}

// Map a handful of common MIME types to file extensions for nicer keys/URLs.
const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Parse a `data:<mime>;base64,<data>` URI into its content type + bytes. */
function parseDataUri(source: string): { contentType: string; buffer: Buffer } | null {
  const match = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,(.+)$/is.exec(source);
  if (!match) return null;
  return { contentType: match[1].toLowerCase(), buffer: Buffer.from(match[2], 'base64') };
}

class UploadService {
  get isConfigured(): boolean {
    return config.storage.r2.configured;
  }

  /**
   * Upload to R2 and return the public URL. If `source` is already an http(s)
   * URL it's returned unchanged (it's hosted somewhere already). Otherwise it
   * must be a base64 data URI, which is decoded and stored.
   */
  private async put(source: string, folder: string, kind: 'image' | 'file'): Promise<string> {
    // Already-hosted URLs pass through untouched.
    if (/^https?:\/\//i.test(source)) return source;

    if (!this.isConfigured) {
      throw new Error(
        `${kind === 'image' ? 'Image' : 'File'} hosting is not configured. Set R2_* environment variables.`
      );
    }

    const parsed = parseDataUri(source);
    if (!parsed) throw new Error('Upload source must be a base64 data URI or an http(s) URL');

    if (kind === 'image' && !parsed.contentType.startsWith('image/')) {
      throw new Error('Image upload requires an image data URI');
    }

    const ext = EXT[parsed.contentType] || parsed.contentType.split('/')[1] || 'bin';
    const key = `${folder}/${randomUUID()}.${ext}`;

    await getClient().send(
      new PutObjectCommand({
        Bucket: config.storage.r2.bucketName,
        Key: key,
        Body: parsed.buffer,
        ContentType: parsed.contentType,
      })
    );

    return `${config.storage.r2.publicUrl}/${key}`;
  }

  /** Upload an image (data URI or remote URL) and return the hosted URL. */
  async uploadImage(source: string, folder = 'misc'): Promise<string> {
    return this.put(source, folder, 'image');
  }

  /** Upload any file (pdf/doc/image) and return the hosted URL. */
  async uploadFile(source: string, folder = 'docs'): Promise<string> {
    return this.put(source, folder, 'file');
  }
}

export default new UploadService();
