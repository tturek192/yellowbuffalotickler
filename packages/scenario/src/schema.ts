import { z } from 'zod';
import { sourced, sourcedOrDisputed, PointSchema } from './sourced';
import { TIERS } from './sources';
import { LocalDateTimeSchema } from './local-time';
import { FrameSchema } from './frame';
import { TerrainGridSchema } from './terrain';

const Side = z.enum(['allied', 'central']);

export const SourcesSchema = z.record(
  z.object({
    title: z.string(),
    author: z.string().optional(),
    year: z.number().optional(),
    url: z.string().optional(),
    tier: z.enum(TIERS),
  }),
);

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

const CompanyBase = z.object({
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
});

const Company = CompanyBase.superRefine((c, ctx) => {
  if (c.role === 'garrison' || c.role === 'reserve') return;
  for (const k of ['sectorId', 'objectiveLineId', 'startAfterMin'] as const) {
    if (c[k] === undefined) ctx.addIssue({ code: 'custom', path: [k], message: `required for role "${c.role}"` });
  }
});
export type Company = z.infer<typeof CompanyBase>;

const FORMATION_KINDS = ['army', 'corps', 'group', 'division', 'brigade', 'regiment', 'battalion'] as const;

export interface Formation {
  id: string;
  name: string;
  kind: (typeof FORMATION_KINDS)[number];
  leaderId?: string;
  children?: Formation[];
  companies?: Company[];
}

const Formation: z.ZodType<Formation> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(FORMATION_KINDS),
    leaderId: z.string().optional(),
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

const ArtillerySchema = z.object({
  id: z.string(),
  side: Side,
  formationId: z.string().optional(),
  weapon: z.string(),
  count: Count,
  role: z.enum(['creeping', 'standing', 'heavy', 'counter-battery', 'trench-mortar', 'mg-barrage', 'defensive']),
});

const WeatherSchema = z.object({
  at: LocalDateTimeSchema,
  precipitation: sourced(z.enum(['none', 'rain', 'sleet', 'snow'])),
  windFromDeg: sourced(z.number()).optional(),
  visibilityM: sourcedOrDisputed(z.number().nonnegative()).optional(),
  tempC: sourced(z.number()).optional(),
});

export const ScenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'reviewed']),
  sources: SourcesSchema,
  zeroHour: sourced(LocalDateTimeSchema),
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
  }),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const DoctrineSchema = z.object({
  id: z.string(),
  title: z.string(),
  sources: SourcesSchema,
  followDistanceM: sourced(z.number().nonnegative()),
  maxAdvanceMPerMin: sourced(z.number().positive()),
  startJitterMin: sourced(z.number().nonnegative()),
  /** Each company's speed varies by up to ± this fraction; 1 or more could stop a company dead. */
  speedJitterFrac: sourced(z.number().nonnegative().lt(1)),
});
export type Doctrine = z.infer<typeof DoctrineSchema>;
