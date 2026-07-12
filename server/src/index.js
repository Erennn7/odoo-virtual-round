import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { startScheduler } from './services/scheduler.js';

import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import departmentRoutes from './routes/departments.js';
import categoryRoutes from './routes/categories.js';
import assetRoutes from './routes/assets.js';
import allocationRoutes from './routes/allocations.js';
import transferRoutes from './routes/transfers.js';
import bookingRoutes from './routes/bookings.js';
import maintenanceRoutes from './routes/maintenance.js';
import auditRoutes from './routes/audits.js';
import dashboardRoutes from './routes/dashboard.js';
import reportRoutes from './routes/reports.js';
import notificationRoutes from './routes/notifications.js';
import activityLogRoutes from './routes/activityLogs.js';
import organizationRoutes from './routes/organization.js';
import searchRoutes from './routes/search.js';

const app = express();

app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') ?? true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'AssetFlow API' }));

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/transfers', transferRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/maintenance', maintenanceRoutes);
app.use('/api/audits', auditRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/organization', organizationRoutes);
app.use('/api/search', searchRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`AssetFlow API listening on http://localhost:${port}`);
  startScheduler();
});
