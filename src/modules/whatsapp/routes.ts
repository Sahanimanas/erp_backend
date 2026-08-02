import { Router, Request, Response, NextFunction } from 'express';
import whatsappController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';
import { uploadMedia } from './media';

const router = Router();

/**
 * Accept a single `file` field, translating multer's rejections (too large,
 * disallowed type) into the module's normal JSON error shape. Left to the
 * global handler they surface as a 500, so an ordinary oversized attachment
 * would read as "something went wrong" in the UI.
 */
const acceptAttachment = (req: Request, res: Response, next: NextFunction): void => {
  uploadMedia.single('file')(req, res, (err: any) => {
    if (!err) return next();
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large for WhatsApp — pick a smaller one.'
        : err.message || 'Upload failed';
    res.status(400).json({ success: false, error: message });
  });
};

// Linking the school's number and sending messages are administrative actions.
const adminOnly = requireRole('SCHOOL_ADMIN', 'PRINCIPAL');

/**
 * Session / linking
 */
router.post('/connect', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.connect(req, res);
});

router.get('/status', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.status(req, res);
});

router.get('/stats', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.stats(req, res);
});

// Emergency stop: drop everything still queued without unlinking the number.
router.post('/cancel-pending', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.cancelPending(req, res);
});

router.post('/pairing-code', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.pairingCode(req, res);
});

router.post('/logout', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.logout(req, res);
});

/**
 * File sharing — upload once, then quote the returned `mediaId` on any send.
 * `requireAuth` runs first so multer can scope the file to the caller's school.
 */
router.post(
  '/media',
  requireAuth,
  adminOnly,
  acceptAttachment,
  async (req, res) => {
    await whatsappController.uploadMedia(req, res);
  }
);

/**
 * Sending
 */
router.post('/send', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.sendText(req, res);
});

router.post('/send-media', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.sendMedia(req, res);
});

router.post('/send-bulk', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.sendBulk(req, res);
});

// Broadcast to all / class / section / selected students
router.post('/broadcast', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.broadcast(req, res);
});

/**
 * Message templates ({{placeholder}} bodies + auto-send events)
 */
router.get('/templates', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.listTemplates(req, res);
});

router.post('/templates', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.upsertTemplate(req, res);
});

router.delete('/templates/:id', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.deleteTemplate(req, res);
});

export default router;
