import { Router } from 'express';
import { invalidateCity } from '../../redis/hotelCache';
import { isSupplierDown, setSupplierDown } from '../../suppliers/outage';
import { SUPPLIER_IDS } from '../../domain/types';
import { asyncHandler } from '../middleware';
import { OutageBodySchema, SupplierParamSchema } from '../validation';

/**
 * Test helpers. They exist so the Postman collection can simulate a supplier
 * outage (and reset it) without restarting the stack.
 */
export const adminRouter: Router = Router();

adminRouter.get(
  '/suppliers',
  asyncHandler(async (_req, res) => {
    const statuses = await Promise.all(
      SUPPLIER_IDS.map(async (supplier) => ({
        supplier,
        down: await isSupplierDown(supplier),
      })),
    );
    res.json({ suppliers: statuses });
  }),
);

adminRouter.post(
  '/suppliers/:supplier/outage',
  asyncHandler(async (req, res) => {
    const { supplier } = SupplierParamSchema.parse(req.params);
    const { down } = OutageBodySchema.parse(req.body ?? {});

    await setSupplierDown(supplier, down);
    res.json({ supplier, down });
  }),
);

adminRouter.delete(
  '/cache/:city',
  asyncHandler(async (req, res) => {
    const city = String(req.params.city ?? '').trim();
    await invalidateCity(city);
    res.json({ city, invalidated: true });
  }),
);
