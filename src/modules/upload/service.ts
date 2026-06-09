import { v2 as cloudinary } from 'cloudinary';
import config from '@config/environment';

let configured = false;

/**
 * Lazily configure the Cloudinary SDK from environment variables. Done lazily
 * (rather than at import time) so the server still boots when no credentials
 * are set — the upload endpoint then returns a clear "not configured" error.
 */
function ensureConfigured(): boolean {
  if (!config.cloudinary.configured) return false;
  if (!configured) {
    cloudinary.config({
      cloud_name: config.cloudinary.cloudName,
      api_key: config.cloudinary.apiKey,
      api_secret: config.cloudinary.apiSecret,
      secure: true,
    });
    configured = true;
  }
  return true;
}

class UploadService {
  get isConfigured(): boolean {
    return config.cloudinary.configured;
  }

  /**
   * Upload an image (data URI or remote URL) to Cloudinary and return the
   * hosted secure URL. `folder` is appended under the configured base folder
   * to keep students/employees/etc. organised.
   */
  async uploadImage(source: string, folder = 'misc'): Promise<string> {
    if (!ensureConfigured()) {
      throw new Error('Image hosting is not configured. Set CLOUDINARY_* environment variables.');
    }

    const result = await cloudinary.uploader.upload(source, {
      folder: `${config.cloudinary.folder}/${folder}`,
      resource_type: 'image',
      overwrite: true,
    });

    return result.secure_url;
  }

  /**
   * Upload any file (pdf/doc/image) to Cloudinary using auto resource detection.
   * Returns the hosted secure URL.
   */
  async uploadFile(source: string, folder = 'docs'): Promise<string> {
    if (!ensureConfigured()) {
      throw new Error('File hosting is not configured. Set CLOUDINARY_* environment variables.');
    }

    const result = await cloudinary.uploader.upload(source, {
      folder: `${config.cloudinary.folder}/${folder}`,
      resource_type: 'auto',
    });

    return result.secure_url;
  }
}

export default new UploadService();
