import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import path from 'path';
import websiteRoutes from './routes/websites';
import alertRoutes from './routes/alerts';
import settingsRoutes from './routes/settings';
import { initCronJobs } from './services/cron';

const app = express();
const PORT = process.env.PORT || 5000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(express.json());

// Serve static screenshots folder
// __dirname in compiled dist/ is backend/dist/, so ../screenshots = backend/screenshots/
app.use('/screenshots', express.static(path.join(__dirname, '../screenshots')));

// API Routes
app.use('/api/websites', websiteRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Website Availability Monitor API is running' });
});

// Initialize monitoring cron jobs
initCronJobs();

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});