import { z } from 'zod';
import { SourcesSchema } from './schema';
import { paramOf, paramRecord, rangedShape } from './tables';
import type { Range } from './tables';

export const COMMON_KEYS = [
  'baseMorale', 'goToGround', 'fallBack', 'surrender', 'pinSuppression',
  'lossShock', 'suppressedDrain', 'isolationDrain', 'recoveryPerHour',
  'leaderMoraleStep', 'closeRangeM', 'quietStepMin',
  'baseOrderDelayMin', 'marchKmPerHour', 'deployMin',
  'reportEveryMin', 'fatiguePerKm', 'fatigueRecoveryPerHour', 'companyFrontageM',
] as const;
export const ATTACK_KEYS = [
  'followDistanceM', 'maxAdvanceMPerMin', 'startJitterMin', 'speedJitterFrac',
  'waveSpacingM', 'mopUpRateMenPerMin', 'stallToleranceMin', 'minAttackRatio',
  'trainingBonusRehearsed', 'ammoReserveFrac',
] as const;
export const DEFENCE_KEYS = [
  'emergeMin', 'trappedSurrenderFrac',
  'localCounterAttackDelayMin', 'divisionalCounterAttackDelayMin',
  'counterAttackMinRatio', 'commitReserveWhenLostFrac', 'counterAttackMinMen', 'counterAttackRetryMin', 'counterAttackPatienceMin',
] as const;
export const COMPANY_DEFAULT_KEYS = [
  'officers', 'lewisGuns', 'machineGuns', 'bombsPerMan', 'strength', 'companiesPerBattalion', 'battalionsPerDivision', 'dugoutDepthM',
  'roundsPerRifle', 'roundsPerLightMg', 'roundsPerMg',
] as const;

export type CommonKey = (typeof COMMON_KEYS)[number];
export type AttackKey = (typeof ATTACK_KEYS)[number];
export type DefenceKey = (typeof DEFENCE_KEYS)[number];

/**
 * Each key's range (tables.ts `Range`), so values the engine cannot use are rejected at load, with their path: morale
 * levels, shares and penalties are fractions; rates, counts, distances and times are >= 0; the march rate, the quiet
 * step and the advance rate are > 0 (a march rate of 0 never arrives, and a reserve 0 km off would arrive at NaN).
 */
export const COMMON_RANGES: Record<CommonKey, Range> = {
  baseMorale: 'fraction', goToGround: 'fraction', fallBack: 'fraction', surrender: 'fraction', pinSuppression: 'fraction',
  lossShock: 'nonnegative', suppressedDrain: 'nonnegative', isolationDrain: 'nonnegative', recoveryPerHour: 'nonnegative',
  leaderMoraleStep: 'fraction', closeRangeM: 'nonnegative', quietStepMin: 'positive',
  baseOrderDelayMin: 'nonnegative', marchKmPerHour: 'positive', deployMin: 'nonnegative',
  reportEveryMin: 'nonnegative', fatiguePerKm: 'nonnegative', fatigueRecoveryPerHour: 'nonnegative', companyFrontageM: 'nonnegative',
};
export const NCO_RANGES: Record<'rehearsed' | 'standard', Range> = { rehearsed: 'fraction', standard: 'fraction' };
export const COMPANY_DEFAULT_RANGES: Record<(typeof COMPANY_DEFAULT_KEYS)[number], Range> = {
  officers: 'nonnegative', lewisGuns: 'nonnegative', machineGuns: 'nonnegative', bombsPerMan: 'nonnegative', strength: 'nonnegative',
  companiesPerBattalion: 'nonnegative', battalionsPerDivision: 'nonnegative', dugoutDepthM: 'nonnegative',
  roundsPerRifle: 'nonnegative', roundsPerLightMg: 'nonnegative', roundsPerMg: 'nonnegative',
};
export const ATTACK_RANGES: Record<AttackKey, Range> = {
  followDistanceM: 'nonnegative', maxAdvanceMPerMin: 'positive', startJitterMin: 'nonnegative', speedJitterFrac: 'fraction',
  waveSpacingM: 'nonnegative', mopUpRateMenPerMin: 'nonnegative', stallToleranceMin: 'nonnegative', minAttackRatio: 'nonnegative',
  trainingBonusRehearsed: 'fraction', ammoReserveFrac: 'fraction',
};
export const DEFENCE_RANGES: Record<DefenceKey, Range> = {
  emergeMin: 'nonnegative', trappedSurrenderFrac: 'fraction',
  localCounterAttackDelayMin: 'nonnegative', divisionalCounterAttackDelayMin: 'nonnegative',
  counterAttackMinRatio: 'nonnegative', commitReserveWhenLostFrac: 'fraction', counterAttackMinMen: 'nonnegative', counterAttackRetryMin: 'nonnegative',
  counterAttackPatienceMin: 'nonnegative',
};
const attackShape = {
  ...rangedShape(ATTACK_RANGES),
  /** Each company's speed varies by up to ± this fraction; 1 or more could stop a company dead. */
  speedJitterFrac: paramOf(z.number().nonnegative().lt(1)),
};

export const DoctrineSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    sources: SourcesSchema,
    common: paramRecord('common', COMMON_KEYS, rangedShape(COMMON_RANGES)),
    ncoPenalty: paramRecord('ncoPenalty', ['rehearsed', 'standard'] as const, rangedShape(NCO_RANGES)),
    companyDefaults: paramRecord('companyDefaults', COMPANY_DEFAULT_KEYS, rangedShape(COMPANY_DEFAULT_RANGES)),
    /**
     * The weapon id (in the model tables) each of a company's counts fires: its riflemen, its `lewisGuns` (the side's
     * light machine guns, whatever the side calls them) and its `machineGuns`. Names stay the scenario's; the weapon is the side's.
     */
    companyWeapons: z.strictObject({ rifle: z.string().min(1), lightMg: z.string().min(1), mg: z.string().min(1) }),
    attack: paramRecord('attack', ATTACK_KEYS, attackShape).optional(),
    defence: paramRecord('defence', DEFENCE_KEYS, rangedShape(DEFENCE_RANGES)).optional(),
  })
  .strict();
export type Doctrine = z.infer<typeof DoctrineSchema>;
