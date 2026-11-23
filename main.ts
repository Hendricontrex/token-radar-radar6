// radar-6: a token launch radar whose every value term is fitted from the
// snapshot's own live-token peers and kept or dropped on four blind tests.
//
//   node main.ts --input <snapshot.json|directory> [--output <dir>]
//
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// The program reads the sealed snapshot, fits the value model and the odds
// model from it, ranks the 340 clean pre-token protocols, writes the board
// to /output/board.json and the dashboard's data to /output/data.js, fills
// the dashboard's computed tables from its own numbers (so the page can
// never disagree with the program), copies dashboard/ and screenshots/ to
// /output, and writes /output/dossier.json with the vendored make.fun
// library. It refuses to write anything when the board fails its own
// checks, when a screenshot is missing or misnamed, or when a dashboard
// placeholder has no number to fill it with.
//
// Deterministic: every shuffle is seeded and nothing reads the clock, so
// two runs of the same snapshot write byte-identical files.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
  type BoardRow,
  type RadarData,
  type SnapshotProtocol,
} from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const here = fileURLToPath(new URL('.', import.meta.url));

/** The scorer's own caps (reference/gate.json): the text cap shapes the bytes, the rest refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** --name <value> out of the arguments, or the fallback. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const withEquals = process.argv.find((a) => a.startsWith(`--${name}=`));
  return withEquals === undefined ? fallback : withEquals.slice(name.length + 3);
}

/** A dollar amount as a whole number, never a float: the gate reads whole dollars. */
function whole(n: number): number {
  return Math.max(1, Math.round(n));
}

/** A number with a fixed decimal count, no locale tricks. */
function num(n: number, digits = 2): string {
  return n.toFixed(digits);
}

/** A dollar amount, compact: $140.3M, $1.13M, $50,000. */
function money(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

/** A percent with one decimal, from a fraction. */
function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token radar: no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input\n`);
  process.exit(2);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const radar: RadarData = buildRadar(snapshot);
const bySlug = new Map<string, SnapshotProtocol>(snapshot.protocols.map((p) => [p.slug, p]));

/** The board's rows, from the dashboard's own tuples, with the snapshot's
 *  own record joined back in and every dollar rounded to a whole number. */
const board: BoardRow[] = radar.rows.map((r) => {
  const p = bySlug.get(r[1])!;
  const growth = r[6] === null ? 0 : Math.max(-60, Math.min(120, r[6])) / 100;
  const growthIdx = radar.model.terms.indexOf('growth') + 1;
  const ageIdx = radar.model.terms.indexOf('ln_age') + 1;
  const growthCoef = growthIdx > 0 ? radar.model.coef[growthIdx]! : 0;
  const ageCoef = ageIdx > 0 ? radar.model.coef[ageIdx]! : 0;
  const ageValue = r[7] ?? radar.model.median_age;
  return {
    rank: r[0],
    slug: r[1],
    name: r[2],
    category: r[3],
    chains: r[4],
    tvl_usd: r[5],
    change_7d: r[6],
    mcap_usd: null,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: r[7],
    implied_value_usd: whole(r[8]),
    range_lo_usd: whole(r[9]),
    range_hi_usd: whole(r[10]),
    conformal_factor: r[9] > 0 ? r[8] / r[9] : 1,
    token_odds: r[11],
    odds_peers: { cat: r[14], band: r[15] },
    verdict: r[12],
    expected_value_usd: whole(r[13]),
    model: {
      growth_pct: growth * 100,
      growth_factor: Math.exp(growthCoef * growth),
      age_factor: Math.exp(ageCoef * Math.log1p(ageValue)),
      category_multiplier: Math.exp(radar.model.adj[r[3] ?? 'Unknown'] ?? 0),
      age_days: r[7],
    },
    farm_steps: r[16],
  };
});

const issue = boardIssue(board, snapshot);
if (issue !== null) {
  process.stderr.write(`token radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), `${JSON.stringify({ rows: board })}\n`);
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping names that start with a dot. */
function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

/** Fill the dashboard's computed tables from the program's own numbers.
 *  Every placeholder must be filled: a dashboard that disagrees with its
 *  program is worse than no dashboard at all, so a missing placeholder
 *  stops the run. */
function fillDashboard(html: string, radar: RadarData): string {
  const coef = (term: string): number => {
    const i = radar.model.terms.indexOf(term);
    return i < 0 ? 0 : radar.model.coef[i + 1]!;
  };
  const filled: Record<string, string> = {};

  /** How one term reads in the formula and what its coefficient means. */
  const termLabel: Record<string, string> = {
    ln_tvl: 'ln(TVL)',
    growth: 'growth',
    ln_age: 'ln(1+age)',
    ln_chains: 'ln(chains)',
  };
  const termMeaning = (term: string, c: number): string => {
    if (term === 'ln_tvl') return `doubling TVL multiplies value by &times;${num(Math.exp(c * Math.LN2), 2)}`;
    if (term === 'growth') return `a +10% week multiplies value by &times;${num(Math.exp(c * 0.1), 2)}`;
    if (term === 'ln_age') return `doubling (1+age) multiplies value by &times;${num(Math.exp(c * Math.LN2), 2)}`;
    if (term === 'ln_chains') return `one more chain multiplies value by &times;${num(Math.exp(c * Math.log(4 / 3)), 2)} at 3 chains`;
    return '';
  };

  filled['{{MODEL_FORMULA}}'] =
    `log(mcap) = ${num(radar.model.coef[0]!, 4)}` +
    radar.model.terms
      .map((t) => {
        const c = coef(t);
        return ` ${c < 0 ? '&minus;' : '+'} ${num(Math.abs(c), 4)}&middot;${termLabel[t] ?? t}`;
      })
      .join('') +
    ' + category offset';

  filled['{{COVER_STATS}}'] =
    `${radar.board_size} protocols ranked &middot; ${radar.verdicts.FARM} FARM &middot; ` +
    `${radar.verdicts.WATCH} WATCH &middot; ${radar.verdicts.SKIP} SKIP &middot; ` +
    `median expected value ${money(radar.ev_median)} &middot; 90th percentile ${money(radar.ev_p90)}`;

  filled['{{KPI_STRIP}}'] =
    `<span class="kpi"><b>${radar.funnel.live + radar.funnel.pre_token}</b> protocols accounted for</span>` +
    `<span class="kpi"><b>${radar.board_size}</b> ranked on this board</span>` +
    `<span class="kpi"><b>&times;${num(radar.model.flat_median, 4)}</b> flat median multiple</span>` +
    `<span class="kpi"><b>${radar.verdicts.FARM}</b> FARM</span>` +
    `<span class="kpi"><b>${radar.verdicts.WATCH}</b> WATCH</span>` +
    `<span class="kpi"><b>${radar.verdicts.SKIP}</b> SKIP</span>` +
    `<span class="kpi"><b>${num(radar.odds.auc, 3)}</b> odds AUC (5-fold)</span>` +
    `<span class="kpi"><b>${pct(radar.validation[1]!.kept.med_err)}</b> time-split median error</span>`;

  filled['{{COEFFICIENTS_TABLE}}'] =
    `<tr><td>intercept</td><td>${num(radar.model.coef[0]!, 4)}</td><td>&mdash;</td></tr>` +
    radar.model.terms
      .map((t) => `<tr><td>${termLabel[t] ?? t}</td><td>${num(coef(t), 4)}</td><td>${termMeaning(t, coef(t))}</td></tr>`)
      .join('') +
    Object.entries(radar.model.adj)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, adj]) => `<tr><td>offset: ${cat}</td><td>${adj >= 0 ? '+' : ''}${num(adj, 4)}</td><td>${radar.model.adj_peers[cat]} fitted peers</td></tr>`)
      .join('');

  filled['{{VALIDATION_TABLE}}'] = radar.validation
    .map(
      (s) =>
        `<tr><td>${s.name}</td><td>${pct(s.kept.med_err)}</td><td>${pct(s.kept.within2)}</td><td>${num(s.kept.spearman, 3)}</td>` +
        `<td>${pct(s.flat.med_err)}</td><td>${pct(s.flat.within2)}</td><td>${num(s.flat.spearman, 3)}</td>` +
        `<td>${pct(s.tvlOnly.med_err)}</td><td>${pct(s.tvlOnly.within2)}</td><td>${num(s.tvlOnly.spearman, 3)}</td></tr>`,
    )
    .join('');

  filled['{{DROPPED_TABLE}}'] = radar.dropped
    .map(
      (d) =>
        `<tr><td>${d.term}</td><td>${num(d.coef_full, 2)}</td><td>${d.wins}</td><td>${d.note}</td></tr>`,
    )
    .join('');

  filled['{{ODDS_TABLE}}'] =
    radar.odds.band_rates
      .map((b, i) => {
        const lo = i === 0 ? 0 : Math.round(radar.odds.band_edges[i]!);
        const hi = i === 3 ? '&infin;' : Math.round(radar.odds.band_edges[i + 1]!);
        return `<tr><td>${lo}&ndash;${hi} days</td><td>${b.n}</td><td>${pct(b.rate)}</td></tr>`;
      })
      .join('') +
    `<tr><td><b>global</b></td><td><b>${radar.integrity.protocols}</b></td><td><b>${pct(radar.odds.global)}</b></td></tr>`;

  filled['{{CALIBRATION_TABLE}}'] = radar.odds.calibration
    .map((c, i) => `<tr><td>quintile ${i + 1}</td><td>${num(c.pred, 2)}</td><td>${num(c.actual, 2)}</td></tr>`)
    .join('');

  filled['{{MULTIPLES_TABLE}}'] = radar.multiples
    .map((m) => `<tr><td>${m.category}</td><td>&times;${num(m.m100, 3)}</td><td>&times;${num(m.m1b, 3)}</td><td>&times;${num(m.m10b, 3)}</td></tr>`)
    .join('');

  filled['{{FUNNEL_TABLE}}'] =
    `<tr><td>protocols in the snapshot</td><td>${radar.integrity.protocols}</td></tr>` +
    `<tr><td>record a token (shown as the market's own value, never ranked)</td><td>${radar.funnel.live}</td></tr>` +
    `<tr><td>&nbsp;&nbsp;of those, record a market cap at or below $0 (dead, excluded from the fit)</td><td>${radar.funnel.live_zero_mcap}</td></tr>` +
    `<tr><td>record no token</td><td>${radar.funnel.pre_token}</td></tr>` +
    radar.funnel.reasons.map((r) => `<tr><td>&nbsp;&nbsp;excluded: ${r.reason}</td><td>${r.n}</td></tr>`).join('') +
    `<tr><td><b>ranked on this board</b></td><td><b>${radar.board_size}</b></td></tr>` +
    `<tr><td>watchlist protocols (all on the board)</td><td>${radar.watchlist_size}</td></tr>`;

  filled['{{INTEGRITY_STRIP}}'] =
    `${radar.integrity.missingListedAt} protocols record no listing date (the fit set's median age, ` +
    `${radar.model.median_age} days, stands in for them; ${radar.integrity.missingListedAtFit} of them are fitted peers) &middot; ` +
    `${radar.integrity.missingChange7d} record no seven-day change (growth 0) &middot; ` +
    `${radar.integrity.mcapZeroOrLess} record a market cap at or below $0 and are excluded from the fit`;

  filled['{{VERDICT_COUNTS}}'] =
    `FARM &ge; ${money(radar.verdict_lines.farm)} expected value: ${radar.verdicts.FARM} rows &middot; ` +
    `WATCH &ge; ${money(radar.verdict_lines.watch)}: ${radar.verdicts.WATCH} rows &middot; ` +
    `SKIP below: ${radar.verdicts.SKIP} rows`;

  filled['{{CONFORMAL_GLOBAL}}'] = `&times;${num(radar.conformal.global, 2)}`;
  filled['{{CONFORMAL_MEDIAN}}'] = `&times;${num(radar.conformal.median_factor, 2)}`;
  filled['{{ODDS_AUC}}'] = num(radar.odds.auc, 3);
  filled['{{ODDS_GLOBAL}}'] = pct(radar.odds.global);
  filled['{{EV_SUMMARY}}'] =
    `median ${money(radar.ev_median)}, 90th percentile ${money(radar.ev_p90)}: ` +
    `FARM is the top ${(100 * radar.verdicts.FARM / radar.board_size).toFixed(1)}% of rows, ` +
    `WATCH the next ${(100 * radar.verdicts.WATCH / radar.board_size).toFixed(1)}%`;

  let out_html = html;
  for (const [token, value] of Object.entries(filled)) {
    if (!out_html.includes(token)) {
      process.stderr.write(`token radar: dashboard is missing its placeholder ${token}\n`);
      process.exit(1);
    }
    out_html = out_html.split(token).join(value);
  }
  // No placeholder may survive: an unfilled {{...}} on the page would read
  // as a broken table to the judge, and a second placeholder set would mean
  // the dashboard and this program disagree about what is computed.
  const leftover = out_html.match(/\{\{[A-Z_]+\}\}/);
  if (leftover !== null) {
    process.stderr.write(`token radar: dashboard still holds an unfilled placeholder ${leftover[0]}\n`);
    process.exit(1);
  }
  return out_html;
}

const dashboardDir = join(here, 'dashboard');
const indexPath = join(dashboardDir, 'index.html');
if (!existsSync(indexPath)) {
  process.stderr.write('token radar: dashboard/index.html is missing\n');
  process.exit(1);
}
mkdirSync(join(out, 'dashboard'), { recursive: true });
writeFileSync(join(out, 'dashboard', 'index.html'), fillDashboard(readFileSync(indexPath, 'utf8'), radar));
for (const name of readdirSync(dashboardDir)) {
  if (name === 'index.html' || name.startsWith('.')) continue;
  const path = join(dashboardDir, name);
  if (!statSync(path).isFile()) continue;
  copyFileSync(path, join(out, 'dashboard', name));
}

const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3) {
  process.stderr.write(`token radar: screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!IMAGE_NAME.test(name)) {
    process.stderr.write(`token radar: screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: { max_files: 400, max_bytes: 4_194_304 } }));

// Verify what was written, not what was computed: read the board back from
// disk and run the gate's own checks on it, and confirm the dashboard the
// judge will read fits whole in the dossier's text.
{
  const written = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8')) as { rows: BoardRow[] };
  const writtenIssue = boardIssue(written.rows, snapshot);
  if (writtenIssue !== null) {
    process.stderr.write(`token radar: the board on disk fails its own check: ${writtenIssue}\n`);
    process.exit(1);
  }
  const dossier = JSON.parse(readFileSync(join(out, 'dossier.json'), 'utf8')) as { text?: string };
  if (typeof dossier.text !== 'string' || dossier.text.length > TEXT_MAX_BYTES) {
    process.stderr.write('token radar: dossier text is missing or past its cap\n');
    process.exit(1);
  }
  const dashboardBytes = readdirSync(join(out, 'dashboard')).reduce(
    (sum, name) => sum + statSync(join(out, 'dashboard', name)).size,
    0,
  );
  if (dashboardBytes > TEXT_MAX_BYTES) {
    process.stderr.write(`token radar: dashboard source is ${dashboardBytes} bytes: past the 64 KB the judge reads whole\n`);
    process.exit(1);
  }
}

process.stdout.write(
  `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ${board.length} rows scored (${radar.board_size} ranked, ${radar.live_size} live set aside)\n` +
    `token radar: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (3 files), ${join(out, 'screenshots')} (${shots.length} images) and ${join(out, 'dossier.json')}\n`,
);
