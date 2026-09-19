import { Router } from 'express';
import { config } from '../../config';
import { logger } from '../../logger';
import { applyJitter, getCatalog } from '../../suppliers/catalog';
import { isSupplierDown } from '../../suppliers/outage';
import type { SupplierId } from '../../domain/types';
import { asyncHandler } from '../middleware';
import { SupplierQuerySchema } from '../validation';

/**
 * The two mock supplier APIs. They are ordinary HTTP endpoints hosted by this
 * service, and the Temporal activities call them over the network exactly as
 * they would call a real supplier.
 */
export const supplierRouter: Router = Router();

const log = logger.child({ component: 'mock-supplier' });

const LATENCY_MS: Record<SupplierId, number> = {
  A: config.SUPPLIER_A_LATENCY_MS,
  B: config.SUPPLIER_B_LATENCY_MS,
};

function register(supplier: SupplierId, path: string): void {
  supplierRouter.get(
    path,
    asyncHandler(async (req, res) => {
      const query = SupplierQuerySchema.parse(req.query);

      const latency = LATENCY_MS[supplier];
      if (latency > 0) {
        await new Promise((resolve) => setTimeout(resolve, latency));
      }

      // Either a one-off `?fail=true` or the sticky outage switch from /admin.
      if (query.fail || (await isSupplierDown(supplier))) {
        log.warn({ supplier, city: query.city, forced: query.fail }, 'Mock supplier returning an outage');
        res.status(503).json({
          error: {
            code: 'SUPPLIER_UNAVAILABLE',
            message: `Supplier ${supplier} is temporarily unavailable`,
          },
        });
        return;
      }

      const hotels = getCatalog(supplier, query.city).map((hotel) => ({
        ...hotel,
        price: applyJitter(hotel.price, config.SUPPLIER_PRICE_JITTER_PCT),
      }));

      res.status(200).json(hotels);
    }),
  );
}

register('A', '/supplierA/hotels');
register('B', '/supplierB/hotels');
