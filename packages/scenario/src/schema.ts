import { z } from 'zod';
import { sourced, sourcedOrDisputed, PointSchema } from './sourced';
import { TIERS } from './sources';
import { LocalDateTimeSchema } from './local-time';
import { FrameSchema } from './frame';
import { TerrainGridSchema } from './terrain';
import { CHANNEL_KINDS, WEAPON_KINDS } from './tables';

const Side = z.enum(['allied', 'central']);

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

export interface Formation {
  id: string;
  name: string;
  kind: (typeof FORMATION_KINDS)[number];
  leaderId?: string;
  /** Where its headquarters stands (local, or lon/lat projected by the loader); absent: behind its companies (engine default). */
  hqPosition?: z.infer<typeof PlacedPoint>;
  children?: Formation[];
  companies?: Company[];
}

const Formation: z.ZodType<Formation> = z.lazy(() =>
  z.strictObject({
    id: z.string(),
    name: z.string(),
    kind: z.enum(FORMATION_KINDS),
    leaderId: z.string().optional(),
    hqPosition: PlacedPoint.optional(),
    children: z.array(Formation).optional(),
    companies: z.array(Company).optional(),
  }),
);

const Rating = sourced(z.number().int().min(1).max(5));
const LeaderSchema = z.object({
  id: z.string(),
  name: sourced(z.string()),
  rank: sourced(z.string()),
  ratings: z
    .object({ planning: Rating, orderSpeed: Rating, adaptiveness: Rating, riskTolerance: Rating, moraleEffect: Rating })
    .optional(),
});

const Window = z.object({ from: LocalDateTimeSchema, to: LocalDateTimeSchema });
const Count = sourcedOrDisputed(z.number().nonnegative());

const ReserveSchema = z.object({
  formationId: z.string(),
  side: Side,
  distanceKm: sourcedOrDisputed(z.number().nonnegative()),
  entryPoint: PlacedPoint,
  orderedAt: sourcedOrDisputed(LocalDateTimeSchema).optional(),
  note: z.string().optional(),
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

const WeatherSchema = z.object({
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
    z.strictObject({ artilleryId: z.string(), task: z.enum(['wire', 'trench', 'battery', 'harass']), rounds: Count }),
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

export const ScenarioSchema = z.object({
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
    z.object({ side: Side, doctrine: z.string(), formations: z.array(Formation) }),
  ),
  /** Off-map formations that arrive later; used by Plan 3. */
  reserves: z.array(ReserveSchema).default([]),
  artillery: z.array(ArtillerySchema).default([]),
  counterBattery: z
    .object({ side: z.literal('allied'), suppressedAtZeroFrac: sourcedOrDisputed(z.number().min(0).max(1)), note: z.string() })
    .optional(),
  weather: z.array(WeatherSchema).default([]),
  bombardment: BombardmentSchema.optional(),
  communications: CommunicationsSchema.optional(),
  operations: z.array(OperationSchema).optional(),
  offMap: OffMapSchema.optional(),
  air: z.strictObject({ superiority: z.union([Side, z.literal('contested')]), observedFrac: sourcedOrDisputed(z.number().min(0).max(1)) }).optional(),
  end: z
    .strictObject({
      /** The ground whose holder wins (Task 15), each piece with the source that makes it key. */
      keyGround: z.array(z.strictObject({ id: z.string(), name: z.string(), featureId: z.string(), cite: sourced(z.string()) })),
      lullMin: sourced(z.number().positive()),
    })
    .optional(),
  historical: z.object({
    objectives: z.array(
      z.object({
        lineId: z.string(),
        sectorId: z.string(),
        earliest: sourcedOrDisputed(LocalDateTimeSchema),
        latest: sourcedOrDisputed(LocalDateTimeSchema),
      }),
    ),
    casualties: z
      .array(
        z.object({
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
    prisonersTaken: z.array(z.object({ bySide: Side, window: Window, count: Count })).default([]),
    gunsCaptured: z
      .object({ window: Window, field: Count, trenchMortars: Count.optional(), machineGuns: Count.optional() })
      .optional(),
    reserveArrivals: z
      .array(z.object({ formationId: z.string(), at: sourcedOrDisputed(LocalDateTimeSchema), where: z.string() }))
      .default([]),
    endedAt: sourcedOrDisputed(LocalDateTimeSchema).optional(),
    /** The side that won (Task 15): the batch reports the share of runs it won. */
    winner: sourced(Side).optional(),
  }),
});
export type Scenario = z.infer<typeof ScenarioSchema>;
