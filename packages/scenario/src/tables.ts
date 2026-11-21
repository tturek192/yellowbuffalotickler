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
  'tankBogPerKm', 'horseLossPerGasRound',
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

export type WeaponKind = (typeof WEAPON_KINDS)[number];
export type Posture = (typeof POSTURES)[number];
export type Ground = (typeof GROUNDS)[number];
export type ChannelKind = (typeof CHANNEL_KINDS)[number];
export type EffectKey = (typeof EFFECT_KEYS)[number];
export type WeaponId = string;

const WeaponSchema = z
  .object({
    kind: z.enum(WEAPON_KINDS),
    rpm: ParamSchema,
    maxRangeM: ParamSchema,
    rangeScaleM: ParamSchema,
    lethality: ParamSchema,
    suppressPerRound: ParamSchema,
    shellKg: ParamSchema.optional(),
  })
  .strict();
export type Weapon = z.infer<typeof WeaponSchema>;

const keyed = <K extends string, V extends z.ZodTypeAny>(keys: readonly K[], value: V) =>
  z.object(Object.fromEntries(keys.map((k) => [k, value]))).strict() as unknown as z.ZodType<Record<K, z.infer<V>>>;

export const TablesSchema = z.strictObject({
  weapons: z.record(z.string(), WeaponSchema),
  cover: keyed(POSTURES, keyed(GROUNDS, ParamSchema)),
  channels: keyed(CHANNEL_KINDS, z.object({ delayMin: ParamSchema, failPerHour: ParamSchema }).strict()),
  effects: paramRecord('effects', EFFECT_KEYS),
});
export type Tables = z.infer<typeof TablesSchema>;
