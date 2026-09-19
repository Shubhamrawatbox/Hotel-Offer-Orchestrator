import express, { type Express } from 'express';
import { accessLog, errorHandler, notFoundHandler, requestContext } from './middleware';
import { adminRouter } from './routes/admin';
import { healthRouter } from './routes/health';
import { hotelsRouter } from './routes/hotels';
import { supplierRouter } from './routes/mockSuppliers';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);
  app.use(express.json({ limit: '64kb' }));
  app.use(requestContext);
  app.use(accessLog);

  app.get('/', (_req, res) => {
    res.json({
      service: 'hotel-offer-orchestrator',
      endpoints: {
        hotels: '/api/hotels?city=delhi&minPrice=&maxPrice=',
        supplierA: '/supplierA/hotels?city=delhi',
        supplierB: '/supplierB/hotels?city=delhi',
        health: '/health',
        admin: '/admin/suppliers',
      },
    });
  });

  app.use('/api', hotelsRouter);
  app.use(supplierRouter);
  app.use('/admin', adminRouter);
  app.use(healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
