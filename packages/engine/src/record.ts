import type { Point, Scenario } from '@wwi/scenario';
import type { SimEvent } from './types';

export const ENGINE_VERSION = '0.1.0';

export type RunRecord = {
  engineVersion: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioStatus: string;
  seed: number;
  zeroHour: string;
  stepMin: number;
  endMinute: number;
  geometry: { lines: Scenario['lines']; sectors: Array<{ id: string; yMin: number; yMax: number }> };
  snapshots: Array<{
    minute: number;
    companies: Array<{ id: string; side: 'allied' | 'central'; x: number; y: number; strength: number; status: string }>;
    barrages: Array<{ sectorId: string; points: Point[] }>;
  }>;
  events: SimEvent[];
  summary: { lineTaken: Array<{ lineId: string; sectorId: string; minute: number }> };
};

/** Round to 0.1 m. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;
