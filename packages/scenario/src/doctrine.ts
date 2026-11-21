import { z } from 'zod';
import { SourcesSchema } from './schema';
import { paramOf, paramRecord } from './tables';

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

const num = z.number();
/** Values the engine cannot use are rejected at load, with their path. */
const attackShape = {
  followDistanceM: paramOf(num.nonnegative()),
  maxAdvanceMPerMin: paramOf(num.positive()),
  startJitterMin: paramOf(num.nonnegative()),
  /** Each company's speed varies by up to ± this fraction; 1 or more could stop a company dead. */
  speedJitterFrac: paramOf(num.nonnegative().lt(1)),
};

export const DoctrineSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    sources: SourcesSchema,
    common: paramRecord('common', COMMON_KEYS),
    ncoPenalty: paramRecord('ncoPenalty', ['rehearsed', 'standard'] as const),
    companyDefaults: paramRecord('companyDefaults', COMPANY_DEFAULT_KEYS),
    /**
     * The weapon id (in the model tables) each of a company's counts fires: its riflemen, its `lewisGuns` (the side's
     * light machine guns, whatever the side calls them) and its `machineGuns`. Names stay the scenario's; the weapon is the side's.
     */
    companyWeapons: z.strictObject({ rifle: z.string().min(1), lightMg: z.string().min(1), mg: z.string().min(1) }),
    attack: paramRecord('attack', ATTACK_KEYS, attackShape).optional(),
    defence: paramRecord('defence', DEFENCE_KEYS).optional(),
  })
  .strict();
export type Doctrine = z.infer<typeof DoctrineSchema>;
