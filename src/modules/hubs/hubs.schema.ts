import { z } from 'zod';

export const hubParamsSchema = z.object({
  hubId: z.coerce.number().int().positive(),
});

export type HubParams = z.infer<typeof hubParamsSchema>;
