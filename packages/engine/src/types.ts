export type SimEvent = {
  minute: number;
  kind: 'zero-hour' | 'barrage-pause' | 'barrage-resume' | 'barrage-done' | 'company-reached' | 'line-taken';
  sectorId?: string;
  lineId?: string;
  unitId?: string;
  text: string;
  causes: string[];
};
