import { Request, Response } from 'express';
import uploadService from './service';
import { successResponse, errorResponse } from '@common/utils/response';

const ALLOWED_FOLDERS = new Set(['students', 'employees', 'misc']);

export class UploadController {
  /**
   * POST /uploads/image
   * Body: { image: <data-uri or url>, folder?: 'students' | 'employees' }
   * Returns: { url }
   */
  async uploadImage(req: Request, res: Response): Promise<void> {
    try {
      const { image, folder } = req.body as { image?: string; folder?: string };

      if (!image || typeof image !== 'string') {
        return void errorResponse(res, 400, 'No image provided');
      }
      // Accept data URIs (base64) and http(s) URLs only.
      if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(image) && !/^https?:\/\//i.test(image)) {
        return void errorResponse(res, 400, 'Image must be a base64 data URI or a URL');
      }

      const dest = folder && ALLOWED_FOLDERS.has(folder) ? folder : 'misc';
      const url = await uploadService.uploadImage(image, dest);
      successResponse(res, 200, { url }, 'Image uploaded');
    } catch (error: any) {
      const notConfigured = /not configured/i.test(error?.message || '');
      errorResponse(res, notConfigured ? 503 : 400, error.message || 'Failed to upload image');
    }
  }

  /**
   * POST /uploads/file
   * Body: { file: <data-uri or url>, folder?: string }
   * Returns: { url } — accepts pdf/doc/image (student & employee documents).
   */
  async uploadFile(req: Request, res: Response): Promise<void> {
    try {
      const { file, folder } = req.body as { file?: string; folder?: string };

      if (!file || typeof file !== 'string') {
        return void errorResponse(res, 400, 'No file provided');
      }
      if (!/^data:[a-z0-9.+-]+\/[a-z0-9.+-]+;base64,/i.test(file) && !/^https?:\/\//i.test(file)) {
        return void errorResponse(res, 400, 'File must be a base64 data URI or a URL');
      }

      const dest = folder && /^[a-z0-9_-]+$/i.test(folder) ? folder : 'docs';
      const url = await uploadService.uploadFile(file, dest);
      successResponse(res, 200, { url }, 'File uploaded');
    } catch (error: any) {
      const notConfigured = /not configured/i.test(error?.message || '');
      errorResponse(res, notConfigured ? 503 : 400, error.message || 'Failed to upload file');
    }
  }
}

export default new UploadController();
