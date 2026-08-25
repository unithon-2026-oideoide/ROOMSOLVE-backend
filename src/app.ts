import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';

import swaggerSpec from './config/swagger';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import landlordRoutes from './routes/landlord.routes';
import reportsRoutes, { manufacturerAsRouter } from './routes/reports.routes';
import quotesRoutes from './routes/quotes.routes';
import vendorsRoutes from './routes/vendors.routes';
import uploadsRoutes from './routes/uploads.routes';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/landlord', landlordRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/manufacturer-as', manufacturerAsRouter);
app.use('/api/quotes', quotesRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/uploads', uploadsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
