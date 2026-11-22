import { z } from 'zod';
import type { Sourced, Disputed } from './sourced';

/**
 * A model number held as data: sourced, or an estimate, always with a plain-language description.
 * `calibrated: true` marks a coefficient fitted rather than looked up, and is allowed only with an `estimate`.
 */
export function paramOf<S extends z.ZodTypeAny>(inner: S) {
  return z
    .object({
      value: inner,
      source: z.string().min(1).optional(),
      page: z.string().optional(),
      note: z.string().optional(),
      estimate: z.string().min(1).optional(),
      description: z.string().min(1),
      calibrated: z.literal(true).optional(),
    })
    .strict()
    .superRefine((p, ctx) => {
      if ((p.source === undefined) === (p.estimate === undefined)) {
        ctx.addIssue({ code: 'custom', message: 'needs exactly one of source or estimate' });
      }
      if (p.calibrated && p.estimate === undefined) {
        ctx.addIssue({ code: 'custom', path: ['calibrated'], message: 'calibrated needs an estimate (a calibrated coefficient is never sourced)' });
      }
      if (p.page !== undefined && p.source === undefined) {
        ctx.addIssue({ code: 'custom', path: ['page'], message: 'page needs a source' });
      }
    });
}
/** A model number: sourced or an estimate (never disputed), with a description; `calibrated` only with an estimate. */
export type Param = Exclude<Sourced<number>, Disputed<number>> & { description: string; calibrated?: true };
export const ParamSchema = paramOf(z.number()) as unknown as z.ZodType<Param>;

/**
 * The values a model number may take, declared with its key (final review fix), so a value out of range fails to load
 * with its path: a `fraction` (a share, probability or 0-to-1 scale) in [0, 1]; a `nonnegative` rate, count, distance
 * or time; a `positive` speed, march rate, divisor or half-life (0 would stop movement or divide by zero).
 */
export type Range = 'fraction' | 'nonnegative' | 'positive';
const RANGE_NUMBER: Record<Range, () => z.ZodNumber> = {
  fraction: () => z.number().min(0).max(1),
  nonnegative: () => z.number().nonnegative(),
  positive: () => z.number().positive(),
};
/** A Param whose value lies in `range`. */
export const paramIn = (range: Range) => paramOf(RANGE_NUMBER[range]());
/** paramRecord's shape for keys with declared ranges. */
export const rangedShape = <K extends string>(ranges: Record<K, Range>): Record<K, z.ZodTypeAny> =>
  Object.fromEntries(Object.entries(ranges).map(([k, r]) => [k, paramIn(r as Range)])) as unknown as Record<K, z.ZodTypeAny>;

/**
 * An object holding exactly `keys`, each a Param (or `shape[key]`). A missing key is reported by its
 * dotted name (`common.baseMorale`), an unknown key is rejected.
 */
export function paramRecord<K extends string>(
  section: string,
  keys: readonly K[],
  shape: Partial<Record<K, z.ZodTypeAny>> = {},
): z.ZodType<Record<K, Param>> {
  const fields = Object.fromEntries(keys.map((k) => [k, (shape[k] ?? ParamSchema).optional()]));
  return z
    .object(fields)
    .strict()
    .superRefine((o, ctx) => {
      for (const k of keys) {
        if ((o as Record<string, unknown>)[k] === undefined) {
          ctx.addIssue({ code: 'custom', path: [k], message: `${section}.${k} is required` });
        }
      }
    }) as unknown as z.ZodType<Record<K, Param>>;
}

export const WEAPON_KINDS = ['small-arms', 'lewis', 'mg', 'field-gun', 'howitzer', 'heavy', 'mortar'] as const;
export const POSTURES = ['moving', 'prone', 'in-trench', 'in-dugout'] as const;
export const GROUNDS = ['open', 'cratered', 'wood', 'village', 'trench'] as const;
export const CHANNEL_KINDS = [
  'buried-cable', 'surface-line', 'runner', 'visual', 'pigeon', 'power-buzzer', 'wireless', 'contact-patrol',
] as const;
export const EFFECT_KEYS = [
  'killedFrac', 'officerExposure', 'densityRefMen', 'suppressionHalfLifeMin',
  'cutPerRound', 'damagePerRound', 'dugoutPerRound', 'safeDepthM', 'lossRate',
  'batteryRecoveryHalfLifeMin',
  'mudSpeedFactor', 'wireSpeedFactor', 'uphillPenaltyPer10m',
  'nightVisibilityM', 'twilightMin',
  'tankBogPerKm', 'horseLossPerGasRound', 'tankBogMudFactor', 'tankMachineGuns',
  'reserveReleaseRangeM', 'closingShareMin', 'batteryWithdrawRangeM', 'limberMin', 'batteryWithdrawM', 'batteryWithdrawMPerMin', 'mineLossFrac',
  'barrageBandDepthM', 'mgBarrageDepthM', 'captureRadiusM', 'captureRatio', 'sortieDelayMin',
  'lineFeatureMatchM', 'callForFireMin', 'stallBarrageMin', 'gunCaptureRadiusM', 'tankSuppressRadiusM',
  'gasHorseRadiusM', 'gapMultiplier', 'maxTargetsPerFirer', 'crewPerLewis', 'crewPerMg', 'trenchProximityM',
  'churnAreaPerShellM2', 'crateredShare', 'wireUncutBelow',
  'strongpointRadiusM', 'villageRadiusM', 'woodRadiusM', 'craterRadiusM',
  'unobservedFireFactor', 'observerRangeM', 'batteriesRecoveredFrac', 'blockedExitFactor',
  'isolationRadiusM', 'mgUnobservedBelow', 'fireRefsMin',
  'suppressionSpeedLoss', 'fatiguePerHourUnderFire', 'bombsPerManCleared',
  'runnerMinPerKm', 'runnerDelayCoversKm', 'callForFireGuns',
  'hqRearOffsetBattalionM', 'hqRearOffsetBrigadeM', 'hqRearOffsetDivisionM', 'hqRearOffsetCorpsM', 'hqRearOffsetArmyM',
  'counterAttackConsolidateMin', 'counterAttackConsolidatedFactor',
] as const;

/** Each effects key's range (`Range`). */
export const EFFECT_RANGES: Record<(typeof EFFECT_KEYS)[number], Range> = {
  killedFrac: 'fraction', officerExposure: 'nonnegative', densityRefMen: 'positive', suppressionHalfLifeMin: 'positive',
  cutPerRound: 'nonnegative', damagePerRound: 'nonnegative', dugoutPerRound: 'nonnegative', safeDepthM: 'positive', lossRate: 'fraction',
  batteryRecoveryHalfLifeMin: 'positive',
  mudSpeedFactor: 'positive', wireSpeedFactor: 'positive', uphillPenaltyPer10m: 'fraction',
  nightVisibilityM: 'nonnegative', twilightMin: 'nonnegative',
  tankBogPerKm: 'fraction', horseLossPerGasRound: 'fraction', tankBogMudFactor: 'nonnegative', tankMachineGuns: 'nonnegative',
  reserveReleaseRangeM: 'nonnegative', closingShareMin: 'fraction', batteryWithdrawRangeM: 'nonnegative', limberMin: 'nonnegative',
  batteryWithdrawM: 'nonnegative', batteryWithdrawMPerMin: 'positive', mineLossFrac: 'fraction',
  barrageBandDepthM: 'nonnegative', mgBarrageDepthM: 'nonnegative', captureRadiusM: 'nonnegative', captureRatio: 'nonnegative', sortieDelayMin: 'nonnegative',
  lineFeatureMatchM: 'nonnegative', callForFireMin: 'nonnegative', stallBarrageMin: 'nonnegative', gunCaptureRadiusM: 'nonnegative', tankSuppressRadiusM: 'nonnegative',
  gasHorseRadiusM: 'nonnegative', gapMultiplier: 'nonnegative', maxTargetsPerFirer: 'nonnegative', crewPerLewis: 'nonnegative', crewPerMg: 'nonnegative',
  trenchProximityM: 'nonnegative',
  churnAreaPerShellM2: 'nonnegative', crateredShare: 'fraction', wireUncutBelow: 'fraction',
  strongpointRadiusM: 'nonnegative', villageRadiusM: 'nonnegative', woodRadiusM: 'nonnegative', craterRadiusM: 'nonnegative',
  unobservedFireFactor: 'fraction', observerRangeM: 'nonnegative', batteriesRecoveredFrac: 'fraction', blockedExitFactor: 'nonnegative',
  isolationRadiusM: 'nonnegative', mgUnobservedBelow: 'fraction', fireRefsMin: 'nonnegative',
  suppressionSpeedLoss: 'fraction', fatiguePerHourUnderFire: 'nonnegative', bombsPerManCleared: 'nonnegative',
  runnerMinPerKm: 'nonnegative', runnerDelayCoversKm: 'nonnegative', callForFireGuns: 'nonnegative',
  hqRearOffsetBattalionM: 'nonnegative', hqRearOffsetBrigadeM: 'nonnegative', hqRearOffsetDivisionM: 'nonnegative', hqRearOffsetCorpsM: 'nonnegative', hqRearOffsetArmyM: 'nonnegative',
  counterAttackConsolidateMin: 'nonnegative', counterAttackConsolidatedFactor: 'nonnegative',
};

export type WeaponKind = (typeof WEAPON_KINDS)[number];
export type Posture = (typeof POSTURES)[number];
export type Ground = (typeof GROUNDS)[number];
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export type EffectKey = (typeof EFFECT_KEYS)[number];
export type WeaponId = string;

/** Ranges (`Range`): a rate of fire, lethality and suppression per round >= 0 (lethality is men hit per round, so may pass 1); ranges and shell weights > 0. */
const WeaponSchema = z
  .object({
    kind: z.enum(WEAPON_KINDS),
    rpm: paramIn('nonnegative'),
    maxRangeM: paramIn('positive'),
    rangeScaleM: paramIn('positive'),
    lethality: paramIn('nonnegative'),
    suppressPerRound: paramIn('nonnegative'),
    shellKg: paramIn('positive').optional(),
  })
  .strict() as unknown as z.ZodType<{ kind: WeaponKind; rpm: Param; maxRangeM: Param; rangeScaleM: Param; lethality: Param; suppressPerRound: Param; shellKg?: Param }>;
export type Weapon = z.infer<typeof WeaponSchema>;

const keyed = <K extends string, V extends z.ZodTypeAny>(keys: readonly K[], value: V) =>
  z.object(Object.fromEntries(keys.map((k) => [k, value]))).strict() as unknown as z.ZodType<Record<K, z.infer<V>>>;

export const TablesSchema = z.strictObject({
  weapons: z.record(z.string(), WeaponSchema),
  // Cover is the share of fire's effect that gets through: a fraction. A channel's delay and failures per hour: >= 0.
  cover: keyed(POSTURES, keyed(GROUNDS, paramIn('fraction') as unknown as z.ZodType<Param>)),
  channels: keyed(CHANNEL_KINDS, z.object({ delayMin: paramIn('nonnegative') as unknown as z.ZodType<Param>, failPerHour: paramIn('nonnegative') as unknown as z.ZodType<Param> }).strict()),
  effects: paramRecord('effects', EFFECT_KEYS, rangedShape(EFFECT_RANGES)),
});
export type Tables = z.infer<typeof TablesSchema>;
