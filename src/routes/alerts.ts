import { Router } from 'express';
import prisma from '../prisma';

const router = Router();

// GET all alerts
router.get('/', async (req, res) => {
  try {
    const alerts = await prisma.alert.findMany({
      include: { website: true },
      orderBy: [
        { resolved: 'asc' },
        { created_at: 'desc' }
      ]
    });
    res.json(alerts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

export default router;