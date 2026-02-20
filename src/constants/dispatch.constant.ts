export const DispatchType = {
  THREE_PL: '3PL',
  FOUR_PL: '4PL',
} as const;

export const RiskLevel = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
} as const;

export const MAX_RISK_SCORE = 100;
export const MIN_CONFIDENCE_SCORE = 0;
export const MAX_CONFIDENCE_SCORE = 100;

export const DEFAULT_SLA_DAYS = 3;
export const HIGH_VOLUME_THRESHOLD = 100;
export const LOW_VOLUME_THRESHOLD = 30;
