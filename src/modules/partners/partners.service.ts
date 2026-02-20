import { PartnerRanking } from '@common/types';
import { PartnerOptimizeInput } from './partners.schema';

// TODO (5.5): Run SLA Risk Agent + Partner Evaluation Agent for a given zone

export async function getOptimalPartner(
  _input: PartnerOptimizeInput
): Promise<PartnerRanking> {
  throw new Error('Not implemented');
}
