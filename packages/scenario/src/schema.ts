import { z } from 'zod';
import { sourced, sourcedOrDisputed, PointSchema } from './sourced';
import { TIERS } from './sources';
import { LocalDateTimeSchema } from './local-time';
import { FrameSchema } from './frame';

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

const Company = z.object({
  id: z.string(),
  name: z.string(),
  strength: sourced(z.number()),
  start: PointSchema,
  sectorId: z.string(),
  objectiveLineId: z.string(),
  startAfterMin: sourced(z.number()),
  role: z.enum(['assault', 'mopup', 'support', 'reserve', 'garrison']),
});

export interface Formation {
  id: string;
  name: string;
  kind: 'corps' | 'division' | 'brigade' | 'battalion';
  leader?: string;
  children?: Formation[];
  companies?: z.infer<typeof Company>[];
}

const Formation: z.ZodType<Formation> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    kind: z.enum(['corps', 'division', 'brigade', 'battalion']),
    leader: z.string().optional(),
    children: z.array(Formation).optional(),
    companies: z.array(Company).optional(),
  }),
);

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
  forces: z.array(
    z.object({ side: Side, doctrine: z.string(), formations: z.array(Formation) }),
  ),
  historical: z.object({
    objectives: z.array(
      z.object({
        lineId: z.string(),
        sectorId: z.string(),
        earliest: sourcedOrDisputed(LocalDateTimeSchema),
        latest: sourcedOrDisputed(LocalDateTimeSchema),
      }),
    ),
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
