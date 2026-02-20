import { DispatchDecision } from '@common/types';
import { DispatchRecommendInput } from './dispatch.schema';

// TODO (5.2): Orchestrate Agents 1 → 2 → 3 → 4 → 6 in sequence
//             Final decision = 3PL or 4PL + which partner

export async function getDispatchRecommendation(
  _input: DispatchRecommendInput
): Promise<DispatchDecision> {
  throw new Error('Not implemented');
}
