import express from 'express';
import dotenv from 'dotenv';

import trackerRouter from './routes/tracker';
import { buildAppConfig } from './config/appConfig';

dotenv.config();

const appConfig = buildAppConfig(process.env);

const app = express();
app.locals.config = appConfig;

app.use(express.json());
app.use('/tracker', trackerRouter);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Product Tracker API is running' });
});

app.listen(appConfig.port, () => {
  console.log(`Server listening on port ${appConfig.port}`);
});

