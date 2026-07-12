import { Router } from 'express';
import whatsappController from './controller';
import { requireAuth, requireRole } from '@common/middleware/auth';

const router = Router();

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

router.post('/pairing-code', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.pairingCode(req, res);
});

router.post('/logout', requireAuth, adminOnly, async (req, res) => {
  await whatsappController.logout(req, res);
});

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
