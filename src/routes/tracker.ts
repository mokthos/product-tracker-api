import { Router } from 'express';

import { AppConfig } from '../types';
import { runTracker } from '../services/trackerService';

const router = Router();

router.post('/', async (req, res) => {
  const { productQuery, sourceUrl } = req.body ?? {};

  if (typeof productQuery !== 'string' || productQuery.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      message: 'productQuery must be a non-empty string',
    });
  }

  const config: AppConfig | undefined = req.app.locals.config;
  if (!config) {
    console.error('App configuration is missing from app.locals');
    return res.status(500).json({
      status: 'error',
      message: 'Server configuration missing',
    });
  }

  try {
    const data = await runTracker(productQuery, sourceUrl, config);

    return res.json({
      status: 'ok',
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Tracker endpoint error:', message);

    return res.status(500).json({
      status: 'error',
      message: 'Unable to fetch tracker data',
    });
  }
});

export default router;

