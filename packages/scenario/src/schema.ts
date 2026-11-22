import { z } from 'zod';
import { sourced, sourcedOrDisputed, PointSchema } from './sourced';
import { TIERS } from './sources';
import { LocalDateTimeSchema } from './local-time';
import { FrameSchema } from './frame';
import { TerrainGridSchema } from './terrain';
import { CHANNEL_KINDS, WEAPON_KINDS } from './tables';

const Side = z.enum(['allied', 'central']);

/** The states of the ground a what-if may set (`groundCondition`); each has its factor in `tables.effects` (`groundDry`, …). */
export const GROUND_CONDITIONS = ['dry', 'normal', 'wet', 'quagmire'] as const;
export type GroundCondition = (typeof GROUND_CONDITIONS)[number];

export const SourcesSchema = z.record(
  z.object({
    title: z.string(),
    author: z.string().optional(),
    year: z.number().optional(),
    url: z.string().optional(),
    tier: z.enum(TIERS),
    /** What the source is good for, and its limits. */
    note: z.string().optional(),
  }),
);
/** A source registry: id to title, tier and the rest. */
export type Sources = z.infer<typeof SourcesSchema>;

/** At least two points, ordered south to north: the engine interpolates x along a line by y. */
const LinePoints = z
  .array(PointSchema)
  .min(2)
  .refine((pts) => pts.every((p, i) => i === 0 || p[1] > pts[i - 1]![1]), {
    message: 'points must have strictly ascending y (south to north)',
  });

export const FEATURE_KINDS = [
  'trench', 'communication-trench', 'wire', 'crater', 'subway', 'tunnel',
  'wood', 'village', 'road', 'railway', 'strongpoint', 'battery',
  // An observation balloon's place (the period map draws one); entered only where a source places one.
  'balloon',
] as const;

const FeatureSchema = z.object({
  id: z.string(),
  kind: z.enum(FEATURE_KINDS),
  side: Side.optional(),
  name: z.string().optional(),
  geometry: z.discriminatedUnion('type', [
    z.object({ type: z.literal('Point'), coordinates: PointSchema, radiusM: z.number().positive().optional() }),
    z.object({ type: z.literal('LineString'), coordinates: z.array(PointSchema).min(2) }),
    z.object({ type: z.literal('Polygon'), coordinates: z.array(PointSchema).min(3) }),
  ]),
  cite: sourced(z.string()),
});
export type Feature = z.infer<typeof FeatureSchema>;
export type FeatureKind = (typeof FEATURE_KINDS)[number];

const LineSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['trench', 'objective']),
  side: Side.optional(),
  color: z.string().optional(),
  points: LinePoints,
});
export type Line = z.infer<typeof LineSchema>;

const LonLat = z.tuple([z.number(), z.number()]);
/** A local point, or a lon/lat pair that the node loader projects with the scenario frame. */
const PlacedPoint = z.union([PointSchema, z.object({ lonLat: LonLat })]);

const CompanyBase = z.strictObject({
  id: z.string(),
  name: z.string(),
  /** Effective strength at Zero. */
  strength: sourced(z.number()),
  paperStrength: sourced(z.number()).optional(),
  start: PlacedPoint,
  sectorId: z.string().optional(),
  objectiveLineId: z.string().optional(),
  startAfterMin: sourced(z.number()).optional(),
  trenchFeatureId: z.string().optional(),
  role: z.enum(['assault', 'mopup', 'support', 'reserve', 'garrison']),
  officers: sourced(z.number().nonnegative()).optional(),
  lewisGuns: sourced(z.number().nonnegative()).optional(),
  machineGuns: sourced(z.number().nonnegative()).optional(),
  /** Depth of the dugouts the company shelters in (metres of cover overhead or below ground). */
  dugoutDepthM: sourced(z.number().nonnegative()).optional(),
  training: z.enum(['rehearsed', 'standard']).optional(),
  /**
   * A garrison company held as a local counter-attack force (Plan 3 Task 12): it holds its own trench, as every garrison
   * does, and leaves it only when its headquarters orders it to counter-attack ground its side has lost.
   */
  counterAttacks: z.literal(true).optional(),
});

const Company = CompanyBase.superRefine((c, ctx) => {
  if (c.role === 'garrison' || c.role === 'reserve') return;
  for (const k of ['sectorId', 'objectiveLineId', 'startAfterMin'] as const) {
    if (c[k] === undefined) ctx.addIssue({ code: 'custom', path: [k], message: `required for role "${c.role}"` });
  }
});
export type Company = z.infer<typeof CompanyBase>;

export const FORMATION_KINDS = ['army', 'corps', 'group', 'division', 'brigade', 'regiment', 'battalion'] as const;

export const INSIGNIA_SHAPES = ['rectangle', 'circle', 'diamond', 'triangle', 'semicircle'] as const;
/**
 * A formation's sleeve insignia (the period map draws its battalions in this colour): a lower-case hex colour, or
 * `none` where a source says the formation wore no patch (its battalions then take the side's colour, and do not
 * inherit a parent's patch: an attached brigade). The shape, where a source gives it.
 */
export const InsigniaSchema = z.strictObject({
  colour: sourced(z.string().regex(/^(#[0-9a-f]{6}|none)$/, 'a lower-case hex colour (#rrggbb) or "none"')),
  shape: z.enum(INSIGNIA_SHAPES).optional(),
});
export type Insignia = z.infer<typeof InsigniaSchema>;

export interface Formation {
  id: string;
  name: string;
  kind: (typeof FORMATION_KINDS)[number];
  leaderId?: string;
  /** Where its headquarters stands (local, or lon/lat projected by the loader); absent: behind its companies (engine default). */
  hqPosition?: z.infer<typeof PlacedPoint>;
  insignia?: Insignia;
  children?: Formation[];
  companies?: Company[];
}

export const FormationSchema: z.ZodType<Formation> = z.lazy(() =>
  z.strictObject({
    id: z.string(),
    name: z.string(),
    kind: z.enum(FORMATION_KINDS),
    leaderId: z.string().optional(),
    hqPosition: PlacedPoint.optional(),
    insignia: InsigniaSchema.optional(),
    children: z.array(FormationSchema).optional(),
    companies: z.array(Company).optional(),
  }),
);

const Rating = sourced(z.number().int().min(1).max(5));
export const LeaderSchema = z.object({
  id: z.string(),
  name: sourced(z.string()),
  rank: sourced(z.string()),
  ratings: z
    .object({ planning: Rating, orderSpeed: Rating, adaptiveness: Rating, riskTolerance: Rating, moraleEffect: Rating })
    .optional(),
});

export type Leader = z.infer<typeof LeaderSchema>;

const Window = z.strictObject({ from: LocalDateTimeSchema, to: LocalDateTimeSchema });
const Count = sourcedOrDisputed(z.number().nonnegative());

const ReserveSchema = z.strictObject({
  formationId: z.string(),
  side: Side,
  distanceKm: sourcedOrDisputed(z.number().nonnegative()),
  entryPoint: PlacedPoint,
  orderedAt: sourcedOrDisputed(LocalDateTimeSchema).optional(),
  note: z.string().optional(),
  /**
   * Multiplies the strength of every company the engine makes up for this reserve (one listed with no companies,
   * engine defaults.ts `withReserveCompanies`); absent: 1. A what-if's `scale-men` sets it (Plan 4 Task 1).
   */
  strengthFactor: sourced(z.number().positive()).optional(),
});

const ArtillerySchema = z.strictObject({
  id: z.string(),
  side: Side,
  formationId: z.string().optional(),
  weapon: z.string(),
  count: Count,
  role: z.enum(['creeping', 'standing', 'heavy', 'counter-battery', 'trench-mortar', 'mg-barrage', 'defensive']),
  /** Rounds available for the battle. */
  ammunition: Count.optional(),
  observation: z.enum(['forward-observer', 'aircraft', 'map']).optional(),
  position: PlacedPoint.optional(),
  horseDrawn: z.boolean().optional(),
});

export const WeatherSchema = z.strictObject({
  at: LocalDateTimeSchema,
  precipitation: sourced(z.enum(['none', 'rain', 'sleet', 'snow'])),
  windFromDeg: sourced(z.number()).optional(),
  visibilityM: sourcedOrDisputed(z.number().nonnegative()).optional(),
  tempC: sourced(z.number()).optional(),
});

const LineSector = z.strictObject({ lineId: z.string(), sectorId: z.string() });
const YBand = z.strictObject({ yMin: z.number(), yMax: z.number() });

const BombardmentSchema = z.strictObject({
  from: sourced(LocalDateTimeSchema),
  allocations: z.array(
    z.strictObject({ artilleryId: z.string(), task: z.enum(['wire', 'trench', 'battery', 'harass', 'gas']), rounds: Count }),
  ),
  spared: z.array(
    YBand.extend({
      featureId: z.string(),
      reason: sourced(z.string()),
      /** The weapon kinds that spared the stretch (it gets no rounds from them); absent: every kind. */
      onlyKinds: z.array(z.enum(WEAPON_KINDS)).min(1).optional(),
    }),
  ),
  wire: z.array(YBand.extend({ featureId: z.string(), beltDepthM: sourced(z.number().positive()) })),
});

const CommunicationsSchema = z.strictObject({
  links: z.array(
    z.strictObject({ side: Side, from: z.enum(FORMATION_KINDS), to: z.enum(FORMATION_KINDS), channels: z.array(z.enum(CHANNEL_KINDS)) }),
  ),
  liaison: z.array(z.strictObject({ side: Side, formationId: z.string(), note: sourced(z.string()) })).optional(),
});

/** The written plan's contingent phases; the engine decides whether and when they run. */
const OperationSchema = z.strictObject({
  id: z.string(),
  side: Side,
  formationId: z.string(),
  kind: z.enum(['attack', 'counter-attack']),
  target: z.union([LineSector, z.strictObject({ featureId: z.string() })]),
  prerequisite: LineSector.optional(),
  notBefore: LocalDateTimeSchema.optional(),
  plan: sourced(z.string()),
});

const OffMapSchema = z.strictObject({
  fire: z.array(
    z.strictObject({
      id: z.string(),
      side: Side,
      weapon: z.string(),
      guns: Count,
      window: Window,
      target: z.union([
        z.strictObject({ featureId: z.string() }),
        z.strictObject({ yMin: z.number(), yMax: z.number(), xMin: z.number(), xMax: z.number() }),
      ]),
      cite: sourced(z.string()),
    }),
  ),
  attacks: z.array(
    z.strictObject({
      id: z.string(),
      side: Side,
      name: z.string(),
      window: Window,
      targetFeatureId: z.string(),
      suppressFrac: sourced(z.number().min(0).max(1)),
      cite: sourced(z.string()),
    }),
  ),
});

/**
 * A tank (Task 14): it follows its sector's creeping barrage from `start` toward `objectiveLineId` and may bog in the
 * mud; it fights no one, but suppresses the enemy close to it while it moves.
 */
const TankSchema = z.strictObject({
  id: z.string(),
  side: Side,
  start: PlacedPoint,
  sectorId: z.string(),
  objectiveLineId: z.string(),
  cite: sourced(z.string()),
});

/** A mine blown under the enemy (Task 14 fix round): `firedAfterMin` minutes after Zero (0: at Zero). */
const MineSchema = z.strictObject({
  id: z.string(),
  side: Side,
  at: PlacedPoint,
  firedAfterMin: sourced(z.number().nonnegative()),
  craterRadiusM: sourced(z.number().positive()),
  cite: sourced(z.string()),
});

/** The conditions under which a run counts the deadlock as broken (Plan 4 Task 3; engine deadlock.ts). */
export const DEADLOCK_CONDITIONS = ['breakthrough', 'surrender', 'collapse', 'stronghold'] as const;
export type DeadlockCondition = (typeof DEADLOCK_CONDITIONS)[number];

/**
 * How a run scores the deadlock (Plan 4 Task 3), an observer that decides nothing in the battle. The first condition in
 * `conditions` to hold is recorded. Each absent value takes the engine's default and is listed in `defaultsUsed`.
 */
const DeadlockSchema = z.strictObject({
  attacker: Side,
  /** The defender's artillery line: a breakthrough is an attacking company beyond it, the line running south to north. */
  artilleryLine: z.union([z.strictObject({ featureId: z.string() }), z.strictObject({ lineId: z.string() })]),
  /** Surrender: the defenders' captured men reach this share of their men (default 0.5, an estimate). */
  surrenderFrac: sourced(z.number().gt(0).max(1)).optional(),
  /** Collapse: a sector's fit defenders fall below this share of those there at Zero (default 0.1, the owner's). */
  collapseFrac: sourced(z.number().gt(0).max(1)).optional(),
  /** Stronghold: the attacker holds every one of these (default: the features of `end.keyGround`). */
  strongholds: z.array(z.strictObject({ featureId: z.string() })).optional(),
  /** The conditions that apply, in the order they are checked (default all four). */
  conditions: z
    .array(z.enum(DEADLOCK_CONDITIONS))
    .refine((xs) => new Set(xs).size === xs.length, { message: 'conditions must not repeat' })
    .optional(),
});

/** Strict at the root (final review fix): a misspelt section fails with its path instead of being dropped. */
export const ScenarioSchema = z.strictObject({
  id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'reviewed']),
  sources: SourcesSchema,
  zeroHour: sourced(LocalDateTimeSchema),
  /** Minutes east of UTC that the scenario's local times are on (for sun and moon). */
  utcOffsetMin: sourced(z.number()).optional(),
  timeLimitMinutes: z.number(),
  geometrySource: sourced(z.string()),
  frame: FrameSchema.optional(),
  /** GeoJSON files (relative to the scenario file) read by the node loader. */
  geo: z.array(z.string()).optional(),
  /** Terrain grid file (relative to the scenario file) read by the node loader into `terrainGrid`. */
  terrain: z.string().optional(),
  terrainGrid: TerrainGridSchema.optional(),
  lines: z.array(LineSchema),
  features: z.array(FeatureSchema).default([]),
  sectors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      yMin: z.number(),
      yMax: z.number(),
      startLineId: z.string(),
      legs: z
        .array(
          z.object({
            toLineId: z.string(),
            liftM: sourced(z.number().positive()),
            liftMin: sourced(z.number().positive()),
            pauseMin: sourced(z.number().nonnegative()),
          }),
        )
        .min(1),
      standOffM: sourced(z.number().nonnegative()),
    }),
  ),
  leaders: z.array(LeaderSchema).default([]),
  forces: z.array(
    z.object({ side: Side, doctrine: z.string(), formations: z.array(FormationSchema) }),
  ),
  /** Off-map formations that arrive later; used by Plan 3. */
  reserves: z.array(ReserveSchema).default([]),
  artillery: z.array(ArtillerySchema).default([]),
  counterBattery: z
    .object({ side: z.literal('allied'), suppressedAtZeroFrac: sourcedOrDisputed(z.number().min(0).max(1)), note: z.string() })
    .optional(),
  weather: z.array(WeatherSchema).default([]),
  /** The state of the ground (Plan 4 Task 1): scales how wet the past day's weather leaves it (engine ground.ts `wetness`); absent: normal. */
  groundCondition: sourced(z.enum(GROUND_CONDITIONS)).optional(),
  bombardment: BombardmentSchema.optional(),
  communications: CommunicationsSchema.optional(),
  operations: z.array(OperationSchema).optional(),
  offMap: OffMapSchema.optional(),
  /** Tanks (Task 14), on the map from Zero. */
  tanks: z.array(TankSchema).optional(),
  /** Mines blown during the battle (Task 14 fix round). */
  mines: z.array(MineSchema).optional(),
  air: z.strictObject({ superiority: z.union([Side, z.literal('contested')]), observedFrac: sourcedOrDisputed(z.number().min(0).max(1)) }).optional(),
  end: z
    .strictObject({
      /** The ground whose holder wins (Task 15), each piece with the source that makes it key. */
      keyGround: z.array(z.strictObject({ id: z.string(), name: z.string(), featureId: z.string(), cite: sourced(z.string()) })),
      lullMin: sourced(z.number().positive()),
    })
    .optional(),
  /** Deadlock scoring (Plan 4 Task 3): absent, a run with `end.keyGround` and an attacker to infer is scored from defaults. */
  deadlock: DeadlockSchema.optional(),
  historical: z.strictObject({
    objectives: z.array(
      z.strictObject({
        lineId: z.string(),
        sectorId: z.string(),
        earliest: sourcedOrDisputed(LocalDateTimeSchema),
        latest: sourcedOrDisputed(LocalDateTimeSchema),
      }),
    ),
    casualties: z
      .array(
        z.strictObject({
          side: Side,
          formationId: z.string().optional(),
          window: Window,
          total: Count,
          killed: Count.optional(),
          wounded: Count.optional(),
          missing: Count.optional(),
          prisoners: Count.optional(),
        }),
      )
      .default([]),
    prisonersTaken: z.array(z.strictObject({ bySide: Side, window: Window, count: Count })).default([]),
    gunsCaptured: z
      .strictObject({ window: Window, field: Count, trenchMortars: Count.optional(), machineGuns: Count.optional() })
      .optional(),
    reserveArrivals: z
      .array(z.strictObject({ formationId: z.string(), at: sourcedOrDisputed(LocalDateTimeSchema), where: z.string() }))
      .default([]),
    endedAt: sourcedOrDisputed(LocalDateTimeSchema).optional(),
    /** The side that won (Task 15): the batch reports the share of runs it won. */
    winner: sourced(Side).optional(),
  }),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
