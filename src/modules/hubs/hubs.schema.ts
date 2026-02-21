import { z } from 'zod';

export const hubParamsSchema = z.object({
  hubId: z.coerce.number().int().positive(),
});

export const hubCostQuerySchema = z.object({
  year: z.coerce.number().int().min(2020).optional(),
  month: z.coerce.number().int().min(1).max(12).optional(),
});

export const hubCostBodySchema = z.object({
  year: z.number().int().min(2020),
  month: z.number().int().min(1).max(12),
  rent: z.number().min(0).default(0),
  employee_cost: z.number().min(0).default(0),
  utility_cost: z.number().min(0).default(0),
  maintenance_cost: z.number().min(0).default(0),
  other_cost: z.number().min(0).default(0),
  notes: z.string().optional(),
});

export const assignPartnersBodySchema = z.object({
  assignments: z.array(
    z.object({
      area_id: z.number().int().positive(),
      partner_id: z.number().int().positive(),
    })
  ).min(1),
});

export type HubParams = z.infer<typeof hubParamsSchema>;
export type HubCostBody = z.infer<typeof hubCostBodySchema>;
export type HubCostQuery = z.infer<typeof hubCostQuerySchema>;
export type AssignPartnersBody = z.infer<typeof assignPartnersBodySchema>;
