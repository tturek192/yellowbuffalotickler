import { describe, expect, it } from 'vitest';
import { buildReview } from '@wwi/scenario';
import { fixtureWithMixedValues, minimalDoctrineV2 } from '@wwi/scenario/test-fixtures';
import { extractOpenQuestions, reviewToMarkdown } from './review-md';

describe('reviewToMarkdown', () => {
  it('renders Markdown with the status checklist', () => {
    expect(reviewToMarkdown(buildReview(fixtureWithMixedValues()), ['Was the 14th or 16th Bavarian Division in the north?'])).toMatch(
      /1\. Was the 14th or 16th Bavarian Division in the north\?[\s\S]*change `status: draft` to `status: reviewed`/,
    );
  });

  it('renders a table per section and a summary of counts', () => {
    const md = reviewToMarkdown(buildReview(fixtureWithMixedValues()), []);
    expect(md).toMatch(/## Historical targets/);
    expect(md).toMatch(/\| Value \| How it is known/);
    expect(md).toMatch(/Estimates: 2/);
  });

  it('shows a parameter\'s description with its value', () => {
    const d = minimalDoctrineV2();
    d.common.baseMorale = { value: 0.8, estimate: 'why', description: 'Starting morale (0 to 1).', calibrated: true };
    const md = reviewToMarkdown(buildReview(fixtureWithMixedValues(), { 'bef-1917': d }), []);
    expect(md).toMatch(/\| \*\*bef-1917 \/ common \/ baseMorale\*\*: 0\.8 — Starting morale \(0 to 1\)\. \| estimate \| estimate \| calibrated \(Plan 4\)\. why \|/);
    expect(md).toMatch(/## Model tables\n\nNo values\./);
  });

  it('lists the engine defaults the scenario leaves open, and has no such section when there are none', () => {
    const s = fixtureWithMixedValues();
    delete s.frame;
    expect(reviewToMarkdown(buildReview(s), [])).toMatch(/## Engine defaults\n\nThe engine fills these in[^\n]*\n\n- No frame: the engine takes sunrise and sunset at lat 0, lon 0/);
    s.frame = { origin: { lon: 2.77, lat: 50.38 }, bearingDeg: { value: 75, estimate: 'test' }, extent: { minX: 0, maxX: 1, minY: 0, maxY: 1 } };
    s.utcOffsetMin = { value: 60, estimate: 'test' };
    expect(reviewToMarkdown(buildReview(s), [])).not.toMatch(/## Engine defaults/);
  });

  it('escapes pipes in cells', () => {
    const s = fixtureWithMixedValues();
    s.geometrySource = { value: 'a | b', source: 'test-src' };
    expect(reviewToMarkdown(buildReview(s), [])).toMatch(/a \\\| b/);
  });
});

describe('extractOpenQuestions', () => {
  const note = [
    '# Note', '', '## Conflicts', '- not this', '', '## Open questions for the historian', '',
    '- **First.** It continues', '  on a second line.', '  - and a nested point', '- Second.', '', '## Sources', '- nor this',
  ].join('\n');
  it('collects the bullets of that section only, labelled with the file', () => {
    expect(extractOpenQuestions(note, 'a.md')).toEqual([
      '[a.md] First. It continues on a second line. and a nested point',
      '[a.md] Second.',
    ]);
  });
  it('returns nothing for a note without the section', () => {
    expect(extractOpenQuestions('# x', 'b.md')).toEqual([]);
  });
});
