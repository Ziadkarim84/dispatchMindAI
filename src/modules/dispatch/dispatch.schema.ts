import { z } from 'zod';

export const dispatchRecommendSchema = z.object({
  hub_id: z.number().int().positive().optional(),
  area_id: z.number().int().positive(),
  parcel_value: z.number().positive(),
  weight: z.number().positive(),
  sla_days: z.number().int().min(1).default(3),
});

export type DispatchRecommendInput = z.infer<typeof dispatchRecommendSchema>;
