import type { Level } from '../types.js';

export interface Severity {
  level: Level;
  label: string;
  confidence: string;
  verdict: string;
}

/** Map a 0..100 threat score to the level/label/verdict vocabulary used in the design. */
export function scoreToSeverity(score: number): Severity {
  if (score >= 85) return { level: 'critical', label: 'CRITICAL', confidence: 'Very high', verdict: 'Malicious' };
  if (score >= 65) return { level: 'high', label: 'HIGH', confidence: 'High', verdict: 'Malicious' };
  if (score >= 40) return { level: 'medium', label: 'MEDIUM', confidence: 'Moderate', verdict: 'Suspicious' };
  if (score >= 20) return { level: 'low', label: 'LOW', confidence: 'Low', verdict: 'Likely benign' };
  return { level: 'none', label: 'CLEAN', confidence: 'High', verdict: 'No threats observed' };
}
