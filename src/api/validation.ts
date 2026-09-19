import { z } from 'zod';

/** Treats an omitted or empty query param as "not provided". */
const optionalPrice = z.preprocess(
  (value) => (value === '' || value === undefined || value === null ? undefined : value),
  z.coerce
    .number({ invalid_type_error: 'must be a number' })
    .finite('must be a finite number')
    .nonnegative('must be zero or greater')
    .optional(),
);

export const HotelQuerySchema = z
  .object({
    city: z
      .string({ required_error: 'city is required' })
      .trim()
      .min(1, 'city is required')
      .max(64, 'city must be 64 characters or fewer'),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
  })
  .refine(
    (query) =>
      query.minPrice === undefined || query.maxPrice === undefined || query.minPrice <= query.maxPrice,
    { message: 'minPrice must be less than or equal to maxPrice', path: ['minPrice'] },
  );

export type HotelQuery = z.infer<typeof HotelQuerySchema>;

export const SupplierQuerySchema = z.object({
  city: z.string().trim().min(1).max(64).optional(),
  /** `?fail=true` makes a single call fail without flipping the global outage switch. */
  fail: z
    .preprocess(
      (value) => (value === undefined ? undefined : String(value).toLowerCase()),
      z.enum(['true', 'false', '1', '0']).optional(),
    )
    .transform((value) => value === 'true' || value === '1'),
});

export const SupplierParamSchema = z.object({
  supplier: z
    .string()
    .transform((value) => value.trim().toUpperCase())
    .pipe(z.enum(['A', 'B'], { errorMap: () => ({ message: 'supplier must be A or B' }) })),
});

export const OutageBodySchema = z.object({
  down: z.boolean({ required_error: 'down is required and must be a boolean' }),
});
