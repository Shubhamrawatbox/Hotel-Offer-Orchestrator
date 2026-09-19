import { Router } from 'express';
import { normalizeCity } from '../../domain/normalize';
import { runHotelSearch } from '../../temporal/hotelSearchService';
import { asyncHandler } from '../middleware';
import { HotelQuerySchema } from '../validation';

export const hotelsRouter: Router = Router();

/**
 * GET /api/hotels?city=delhi
 * GET /api/hotels?city=delhi&minPrice=4000&maxPrice=6000
 *
 * The body is the bare array the brief specifies; everything else about the run
 * (workflow id, where the data came from, whether a supplier was down) is
 * exposed through response headers so the contract stays clean.
 */
hotelsRouter.get(
  '/hotels',
  asyncHandler(async (req, res) => {
    const query = HotelQuerySchema.parse(req.query);
    const city = normalizeCity(query.city);

    const result = await runHotelSearch({
      city,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      requestId: req.id,
    });

    res.setHeader('x-workflow-id', result.workflowId);
    res.setHeader('x-run-id', result.runId);
    res.setHeader('x-offers-source', result.source);
    res.setHeader('x-total-before-filter', String(result.totalBeforeFilter));
    res.setHeader('x-suppliers-succeeded', result.suppliersSucceeded.join(',') || 'none');

    if (result.suppliersFailed.length > 0) {
      // Partial data: the caller still gets offers, but is told it is incomplete.
      res.setHeader('x-degraded', 'true');
      res.setHeader('x-suppliers-failed', result.suppliersFailed.map((f) => f.supplier).join(','));
    }

    res.status(200).json(result.offers);
  }),
);
