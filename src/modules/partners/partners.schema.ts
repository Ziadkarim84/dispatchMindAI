import { z } from 'zod';

export const partnerOptimizeSchema = z.object({
  area_id: z.coerce.number().int().positive(),
  hub_id: z.coerce.number().int().positive(),
});

export type PartnerOptimizeInput = z.infer<typeof partnerOptimizeSchema>;
