import { Router } from 'express';
import prisma from '../prisma';
import { sendTestEmail } from '../services/email';

const router = Router();

// GET global settings
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.globalSetting.findUnique({
      where: { id: 'default' }
    });

    if (!settings) {
      settings = await prisma.globalSetting.create({
        data: { id: 'default' }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// PUT global settings
router.put('/', async (req, res) => {
  try {
    const updated = await prisma.globalSetting.upsert({
      where: { id: 'default' },
      update: req.body,
      create: { ...req.body, id: 'default' }
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// GET email settings
router.get('/email', async (req, res) => {
  try {
    let settings = await prisma.notificationSettings.findUnique({
      where: { id: 'default' }
    });

    if (!settings) {
      settings = await prisma.notificationSettings.create({
        data: { id: 'default' }
      });
    }

    res.json(settings);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch email settings' });
  }
});

// PUT email settings
router.put('/email', async (req, res) => {
  try {
    const updated = await prisma.notificationSettings.upsert({
      where: { id: 'default' },
      update: req.body,
      create: { ...req.body, id: 'default' }
    });
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to update email settings' });
  }
});

// POST test email
router.post('/test-email', async (req, res) => {
  try {
    const settings = req.body;
    await sendTestEmail(settings);
    res.json({ message: 'Test email sent successfully' });
  } catch (error: any) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Failed to send test email' });
  }
});

export default router;