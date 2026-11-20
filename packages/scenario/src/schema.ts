import { z } from 'zod';
import { sourced, PointSchema } from './sourced';

const Side = z.enum(['allied', 'central']);

export const SourcesSchema = z.record(
  z.object({
    title: z.string(),
    author: z.string().optional(),
    year: z.number().optional(),
    url: z.string().optional(),
  }),
);

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
  zeroHour: sourced(z.string()),
  timeLimitMinutes: z.number(),
  geometrySource: sourced(z.string()),
  lines: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      kind: z.enum(['trench', 'objective']),
      side: Side.optional(),
      color: z.string().optional(),
      points: z.array(PointSchema),
    }),
  ),
  sectors: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      yMin: z.number(),
      yMax: z.number(),
      startLineId: z.string(),
      legs: z.array(
        z.object({
          toLineId: z.string(),
          liftM: sourced(z.number()),
          liftMin: sourced(z.number()),
          pauseMin: sourced(z.number()),
        }),
      ),
      standOffM: sourced(z.number()),
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
        earliest: sourced(z.string()),
        latest: sourced(z.string()),
      }),
    ),
  }),
});
export type Scenario = z.infer<typeof ScenarioSchema>;

export const DoctrineSchema = z.object({
  id: z.string(),
  title: z.string(),
  sources: SourcesSchema,
  followDistanceM: sourced(z.number()),
  maxAdvanceMPerMin: sourced(z.number()),
  startJitterMin: sourced(z.number()),
  speedJitterFrac: sourced(z.number()),
});
export type Doctrine = z.infer<typeof DoctrineSchema>;
