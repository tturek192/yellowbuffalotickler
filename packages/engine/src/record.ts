import type { Feature, Point, Scenario } from '@wwi/scenario';
import type { CompanyState } from './companies';
import type { SimEvent } from './types';

export const ENGINE_VERSION = '0.2.0';

export type RunRecord = {
  engineVersion: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioStatus: Scenario['status'];
  seed: number;
  zeroHour: string;
  stepMin: number;
  endMinute: number;
  geometry: {
    lines: Scenario['lines'];
    sectors: Array<{ id: string; yMin: number; yMax: number }>;
    /** Map features (trenches, wire, woods, …) in local metres, as the scenario holds them. */
    features: Feature[];
  };
  snapshots: Array<{
    minute: number;
    companies: Array<{
      id: string;
      side: CompanyState['side'];
      x: number;
      y: number;
      strength: number;
      status: CompanyState['status'];
    }>;
    /** `done` once the sector's barrage has ended; its points then hold where it last stood. */
    barrages: Array<{ sectorId: string; done: boolean; points: Point[] }>;
  }>;
  events: SimEvent[];
  summary: { lineTaken: Array<{ lineId: string; sectorId: string; minute: number }> };
};

/** Round to 0.1 m. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;
