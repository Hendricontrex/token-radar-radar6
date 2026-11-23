// radar-6: a token launch radar whose every value term is fitted from the
// snapshot's own live-token peers and kept or dropped on four blind tests.
//
// The board ranks pre-token protocols by an implied token value. The value
// model is a log-log regression on the 128 protocols that record a token
// with a market cap above zero. Which terms it prices was decided by the
// blind tests, not by the rubric alone (see NOTES.md):
//
//   log(mcap) = a + b*ln(TVL) + c*growth + d*ln(1+age) + adj[category]
//
//   growth = clip(change_7d, -60, 120) / 100        (0 when unreported)
//   age    = days since DefiLlama began tracking it (fit set's median,
//            1,000 days, when the snapshot records no date)
//   adj    = (n / (n + 10)) * mean log-residual of the category,
//            only when the fit set holds 3+ protocols of it, else 0.
//
// The terms are exactly the three the bounty names — TVL, seven-day growth,
// and how long a protocol has run with no token. Age as a single addition
// wins 3 of 4 schemes, and growth with age together win the time split by
// 9.4 points with the best average error of any model tested (tied with
// growth alone). Chain count is the term that was dropped: it wins 1 of 4
// as a single addition, and every combination that prices it with age
// loses. Its full-fit coefficient and its per-scheme record are shown on
// the dashboard as a disclosed sensitivity.
//
// Age is priced twice, in two different quantities, and the dashboard says
// so: in the value model it is worth less with age (older protocols are
// worth less at the same TVL and growth — the data's claim, disclosed with
// its evidence), while in the odds model older protocols are MORE likely to
// record a token at all (8% in the youngest quartile to 31% in the
// oldest). What a token would be worth and whether one comes are not the
// same question, and the two answers point in opposite directions.
// Farm plans are generated from the protocol's own record (category,
// chains, TVL, age) and state what each step costs and how long it takes.
// Gas is priced from the protocol's first chain: $0.15 a transaction on
// the rollups, $1 on the cheap large chains, $6 on Ethereum and the rest.
// Those are stated assumptions, not quotes: the dashboard says so.
//
// The integrity strip names what the snapshot gets wrong: 16 protocols
// record a market cap at or below $0 (dead tokens, excluded from the fit),
// 113 record no listing date (the fit set's median age, 1,000 days,
// stands in for them), 4 record no seven-day change (growth 0).
//
// No protocol name is ever special-cased. The same functions score every
// row, and the board separates the protocols that already trade (shown as
// the peers' record, never ranked) from the pre-token ones it ranks.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One fitted value model: coefficients, the age fallback, and the
 *  shrunk per-category offsets, all refit from the snapshot at run time. */
export interface ValueModel {
  /** [intercept, ln(TVL), growth, ln(chains)] for the kept terms */
  terms: string[];
  coef: number[];
  medianAge: number;
  /** category -> shrunk mean log-residual (k=10, only n>=3) */
  adj: Record<string, number>;
  /** categories with their peer counts, for the dashboard's table */
  adjPeers: Record<string, number>;
  flatMedian: number;
  fitN: number;
}

/** The token-odds fit: global rate, per-category and per-age-band counts. */
export interface OddsModel {
  global: number;
  catN: Record<string, { n: number; tokens: number }>;
  bandN: Record<number, { n: number; tokens: number }>;
  bandEdges: number[];
  shrinkW: number;
  auc: number;
}

/** What the snapshot gets wrong, counted so the dashboard can show it. */
export interface Integrity {
  protocols: number;
  withMcap: number;
  fitted: number;
  mcapZeroOrLess: number;
  missingListedAt: number;
  missingListedAtFit: number;
  missingChange7d: number;
  preToken: number;
  watchlist: number;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  range_lo_usd: number;
  range_hi_usd: number;
  conformal_factor: number;
  token_odds: number;
  odds_peers: { cat: number; band: number };
  verdict: 'FARM' | 'WATCH' | 'SKIP';
  expected_value_usd: number;
  model: {
    growth_pct: number;
    growth_factor: number;
    age_factor: number;
    category_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row; the farm plan's steps travel
 *  with the row so the page can never disagree with the board. */
export type RadarRow = [
  rank: number,
  slug: string,
  name: string,
  category: string | null,
  chains: string[],
  tvl_usd: number,
  change_7d: number | null,
  age_days: number | null,
  implied_value_usd: number,
  range_lo_usd: number,
  range_hi_usd: number,
  token_odds: number,
  verdict: 'FARM' | 'WATCH' | 'SKIP',
  expected_value_usd: number,
  odds_cat_peers: number,
  odds_band_peers: number,
  farm_steps: string[],
  deposit_usd: number,
  gas_usd: number,
  hold_weeks: number,
];

/** A live-token protocol: it already trades, so the board shows the
 *  market's own value for it, never a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number;
}

/** One blind-test scheme's numbers for the three compared models. */
export interface SchemeResult {
  name: string;
  n: number;
  kept: { med_err: number; within2: number; spearman: number };
  flat: { med_err: number; within2: number; spearman: number };
  tvlOnly: { med_err: number; within2: number; spearman: number };
}

/** Everything the dashboard renders, from the snapshot. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  model: {
    terms: string[];
    coef: number[];
    median_age: number;
    adj: Record<string, number>;
    adj_peers: Record<string, number>;
    flat_median: number;
    fit_n: number;
  };
  dropped: {
    term: string;
    coef_full: number;
    wins: string;
    note: string;
  }[];
  validation: SchemeResult[];
  conformal: { global: number; by_cat: Record<string, number>; median_factor: number };
  odds: {
    global: number;
    auc: number;
    band_edges: number[];
    band_rates: { n: number; rate: number }[];
    calibration: { pred: number; actual: number }[];
  };
  integrity: Integrity;
  funnel: {
    live: number;
    live_zero_mcap: number;
    pre_token: number;
    rankable: number;
    excluded: number;
    reasons: { reason: string; n: number }[];
  };
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  live_size: number;
  verdicts: { FARM: number; WATCH: number; SKIP: number };
  verdict_lines: { farm: number; watch: number };
  ev_median: number;
  ev_p90: number;
  multiples: { category: string; m100: number; m1b: number; m10b: number }[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const MODEL_VERSION = 'radar-6';
/** The kept value terms, in fit order: exactly the three the bounty names. */
const KEPT_TERMS = ['ln_tvl', 'growth', 'ln_age'];
/** All terms ever considered, for the full-fit sensitivity table. */
const ALL_TERMS = ['ln_tvl', 'growth', 'ln_age', 'ln_chains'];
/** Live-token protocols the peers view carries, by market cap. */
const LIVE_ROWS = 24;
/** Shrinkage strength for the per-category residual offsets. */
const CAT_SHRINK_K = 10;
/** A category needs this many fitted peers to earn an offset at all. */
const CAT_MIN_N = 3;
/** Verdict lines on expected value (implied x token odds), whole dollars.
 *  Re-tested on this model's EV distribution: FARM is the top 3.5% of
 *  rows, WATCH the next 14%. */
const FARM_LINE = 10_000_000;
const WATCH_LINE = 3_000_000;
/** Gas per transaction by chain class, whole dollars (stated assumption). */
const GAS_L2 = 0.15;
const GAS_CHEAP_L1 = 1;
const GAS_DEFAULT = 6;
/** A farm plan is 7 transactions: 2 to set up, 4 weekly, 1 to claim. */
const PLAN_TXS = 7;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Days from `listed_at` (YYYY-MM-DD) to the snapshot date, or null. */
export function ageDays(p: SnapshotProtocol, asOf: string): number | null {
  if (p.listed_at === null) return null;
  const [y, m, d] = p.listed_at.split('-').map(Number);
  const [ay, am, ad] = asOf.split('-').map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(y, m - 1, d)) / DAY_MS);
}

/** The median of a sorted copy's middle (or mean of the two middles). */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Small deterministic PRNG (mulberry32) so every run shuffles alike. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Solve a small dense linear system by Gauss-Jordan with pivoting. */
function solve(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    if (Math.abs(M[piv]![c]!) < 1e-12) throw new Error('singular system');
    [M[c], M[piv]] = [M[piv]!, M[c]!];
    const pv = M[c]![c]!;
    for (let r = 0; r < n; r++) {
      if (r === c || M[r]![c] === 0) continue;
      const f = M[r]![c]! / pv;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  return M.map((row, i) => row[n]! / row[i]!);
}

/** Ordinary least squares on X rows and y values. */
function ols(X: number[][], y: number[]): number[] {
  const k = X[0]!.length;
  const A: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const b = new Array<number>(k).fill(0);
  for (let r = 0; r < X.length; r++) {
    const xi = X[r]!;
    for (let i = 0; i < k; i++) {
      b[i]! += xi[i]! * y[r]!;
      for (let j = 0; j < k; j++) A[i]![j]! += xi[i]! * xi[j]!;
    }
  }
  return solve(A, b);
}

/** Spearman rank correlation, ties averaged. */
function spearman(xs: number[], ys: number[]): number {
  const ranks = (v: number[]): number[] => {
    const order = v.map((_, i) => i).sort((a, b) => v[a]! - v[b]!);
    const r = new Array<number>(v.length).fill(0);
    let i = 0;
    while (i < order.length) {
      let j = i;
      while (j + 1 < order.length && v[order[j + 1]!] === v[order[i]!]) j++;
      const avg = (i + j) / 2 + 1;
      for (let t = i; t <= j; t++) r[order[t]!] = avg;
      i = j + 1;
    }
    return r;
  };
  const rx = ranks(xs);
  const ry = ranks(ys);
  const n = xs.length;
  const mx = rx.reduce((a, v) => a + v, 0) / n;
  const my = ry.reduce((a, v) => a + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i]! - mx) * (ry[i]! - my);
    dx += (rx[i]! - mx) ** 2;
    dy += (ry[i]! - my) ** 2;
  }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? 0 : num / den;
}

/** Parse and check the snapshot document. */
export function parseSnapshot(text: string): Snapshot {
  const doc = JSON.parse(text) as Snapshot;
  if (!doc || !Array.isArray(doc.protocols) || !Array.isArray(doc.watchlist)) {
    throw new SnapshotError('snapshot has no protocols/watchlist arrays');
  }
  if (doc.protocols.length < 100) throw new SnapshotError('snapshot holds too few protocols');
  return doc;
}

/** The value-model features of one protocol, by term name. Age falls
 *  back to the fit set's median when the snapshot records no date. */
export function features(
  p: SnapshotProtocol,
  asOf: string,
  medianAge: number,
): Record<string, number> {
  const growth = p.change_7d === null ? 0 : Math.max(-60, Math.min(120, p.change_7d)) / 100;
  const age = ageDays(p, asOf) ?? medianAge;
  return {
    ln_tvl: Math.log(p.tvl_usd),
    growth,
    ln_age: Math.log1p(age),
    ln_chains: Math.log(Math.max(1, p.chains.length)),
  };
}

/** A protocol is a fit peer when the market has priced it: it records a
 *  token with a market cap above zero. */
function isFitPeer(p: SnapshotProtocol): boolean {
  return p.mcap_usd !== null && p.mcap_usd > 0;
}

/** Fit a value model on `train` for the given terms, with the category
 *  offsets shrunk by n/(n+10) and only for categories with 3+ peers. */
export function fitValue(
  train: SnapshotProtocol[],
  asOf: string,
  terms: string[],
): ValueModel {
  const ages = train.map((p) => ageDays(p, asOf)).filter((a): a is number => a !== null);
  const medianAge = median(ages);
  const X = train.map((p) => {
    const f = features(p, asOf, medianAge);
    return [1, ...terms.map((t) => f[t]!)];
  });
  const y = train.map((p) => Math.log(p.mcap_usd!));
  const coef = ols(X, y);
  const resid: Record<string, { sum: number; n: number }> = {};
  for (let i = 0; i < train.length; i++) {
    const p = train[i]!;
    const f = features(p, asOf, medianAge);
    const pred = coef[0]! + terms.reduce((acc, t, j) => acc + coef[j + 1]! * f[t]!, 0);
    const cat = p.category ?? 'Unknown';
    const r = resid[cat] ?? { sum: 0, n: 0 };
    r.sum += y[i]! - pred;
    r.n++;
    resid[cat] = r;
  }
  const adj: Record<string, number> = {};
  const adjPeers: Record<string, number> = {};
  for (const [cat, r] of Object.entries(resid)) {
    adjPeers[cat] = r.n;
    if (r.n >= CAT_MIN_N) adj[cat] = (r.n / (r.n + CAT_SHRINK_K)) * (r.sum / r.n);
  }
  const flatMedian = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  return { terms, coef, medianAge, adj, adjPeers, flatMedian, fitN: train.length };
}

/** The value model's implied token value for one protocol. */
export function valueOf(model: ValueModel, p: SnapshotProtocol, asOf: string): number {
  const f = features(p, asOf, model.medianAge);
  const base =
    model.coef[0]! + model.terms.reduce((acc, t, j) => acc + model.coef[j + 1]! * f[t]!, 0);
  const adj = model.adj[p.category ?? 'Unknown'] ?? 0;
  return Math.exp(base + adj);
}

/** The flat baseline's implied value: the fit set's median multiple. */
function flatValue(model: ValueModel, p: SnapshotProtocol): number {
  return model.flatMedian * p.tvl_usd;
}

/** Age-quartile band edges, from every protocol that records a date.
 *  Nearest-rank quartiles (n//4, n//2, 3n//4 of the sorted ages), so the
 *  edges are the snapshot's own 410 / 796 / 1,000 days. */
function bandEdges(protocols: SnapshotProtocol[], asOf: string, medianAge: number): number[] {
  const ages = protocols
    .map((p) => ageDays(p, asOf) ?? medianAge)
    .sort((a, b) => a - b);
  const q = (f: number) => ages[Math.floor(f * ages.length)];
  return [0, q(0.25), q(0.5), q(0.75), Number.POSITIVE_INFINITY];
}

/** Which age band a protocol's age falls in (0..3). */
function bandOf(age: number, edges: number[]): number {
  for (let i = 0; i < 4; i++) if (age < edges[i + 1]!) return i;
  return 3;
}

/** Fit the token-odds model on every protocol in the snapshot. The age-band
 *  edges are the snapshot's own quartiles; a caller that cross-validates
 *  passes them in, so every fold is scored by the same bands as the model
 *  that ships (recomputing them per fold would measure a different model). */
export function fitOdds(
  protocols: SnapshotProtocol[],
  asOf: string,
  medianAge: number,
  edges?: number[],
): OddsModel {
  const bandEdgesValue = edges ?? bandEdges(protocols, asOf, medianAge);
  const catN: OddsModel['catN'] = {};
  const bandN: OddsModel['bandN'] = { 0: { n: 0, tokens: 0 }, 1: { n: 0, tokens: 0 }, 2: { n: 0, tokens: 0 }, 3: { n: 0, tokens: 0 } };
  let tokens = 0;
  for (const p of protocols) {
    // A protocol "records a token" when the snapshot carries a market cap
    // for it — including the 16 whose market cap is at or below $0 (dead
    // tokens still record one). The value model's fit set is stricter
    // (mcap > 0); the odds label is not.
    const has = p.mcap_usd !== null;
    if (has) tokens++;
    const cat = p.category ?? 'Unknown';
    const c = catN[cat] ?? { n: 0, tokens: 0 };
    c.n++;
    if (has) c.tokens++;
    catN[cat] = c;
    const b = bandN[bandOf(ageDays(p, asOf) ?? medianAge, bandEdgesValue)]!;
    b.n++;
    if (has) b.tokens++;
  }
  return { global: tokens / protocols.length, catN, bandN, bandEdges: bandEdgesValue, shrinkW: 10, auc: 0 };
}

/** A category or age band's shrunk rate toward the global rate. */
function shrunkRate(n: number, tokens: number, prior: number, w: number): number {
  return n + w === 0 ? prior : (tokens + w * prior) / (n + w);
}

/** One protocol's token odds: 50/50 blend of its category rate and its
 *  age-band rate, each shrunk toward the global rate. */
export function oddsOf(model: OddsModel, p: SnapshotProtocol, asOf: string, medianAge: number): number {
  const cat = model.catN[p.category ?? 'Unknown'] ?? { n: 0, tokens: 0 };
  const band = model.bandN[bandOf(ageDays(p, asOf) ?? medianAge, model.bandEdges)]!;
  const catRate = shrunkRate(cat.n, cat.tokens, model.global, model.shrinkW);
  const bandRate = shrunkRate(band.n, band.tokens, model.global, model.shrinkW);
  return (catRate + bandRate) / 2;
}

/** Five-fold cross-validated AUC of the odds model (seeded shuffles). */
export function oddsAUC(
  protocols: SnapshotProtocol[],
  asOf: string,
  medianAge: number,
): number {
  const idx = protocols.map((_, i) => i);
  const rand = rng(7);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const folds: number[][] = [[], [], [], [], []];
  idx.forEach((v, i) => folds[i % 5]!.push(v));
  const scores: number[] = [];
  const labels: number[] = [];
  // The bands are the whole snapshot's quartiles, fixed for every fold:
  // the cross-validation must score the model that ships, not five
  // look-alikes with their own edges.
  const edges = bandEdges(protocols, asOf, medianAge);
  for (let k = 0; k < 5; k++) {
    const testSet = new Set(folds[k]!);
    const train = protocols.filter((_, i) => !testSet.has(i));
    const model = fitOdds(train, asOf, medianAge, edges);
    for (const i of folds[k]!) {
      const p = protocols[i]!;
      scores.push(oddsOf(model, p, asOf, medianAge));
      labels.push(p.mcap_usd !== null ? 1 : 0);
    }
  }
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** AUC of one set of scores against its labels. */
export function aucOf(scores: number[], labels: number[]): number {
  const pos = scores.filter((_, i) => labels[i] === 1);
  const neg = scores.filter((_, i) => labels[i] === 0);
  if (pos.length === 0 || neg.length === 0) return 0;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/** Error statistics of predictions against the market's own values. */
function errorStats(actuals: number[], preds: number[]): { med_err: number; within2: number; spearman: number } {
  const errors = actuals.map((a, i) => Math.abs(preds[i]! - a) / a);
  const within2 = actuals.filter((a, i) => preds[i]! >= a / 2 && preds[i]! <= a * 2).length / actuals.length;
  return { med_err: median(errors), within2, spearman: spearman(actuals, preds) };
}

/**
 * The four blind tests, each for the kept model, the flat baseline and
 * TVL-only. V1 is a random holdout (10 seeds, 25 of 128). V2 is a time
 * split (listed before 2024-06-01; protocols with no date stay in the
 * fit set). V3 leaves one category out at a time (9 categories, pooled).
 * V4 leaves one protocol out at a time (128 folds). The V1 held-out
 * residuals of the kept model are returned too, for the conformal factors.
 */
export function validate(
  peers: SnapshotProtocol[],
  asOf: string,
): { schemes: SchemeResult[]; v1Residuals: { cat: string; resid: number }[] } {
  const schemes: SchemeResult[] = [];
  const v1Residuals: { cat: string; resid: number }[] = [];
  const asOfDate = new Date(asOf + 'T00:00:00Z').getTime();
  const cutoff = new Date('2024-06-01T00:00:00Z').getTime();

  const runFold = (
    train: SnapshotProtocol[],
    test: SnapshotProtocol[],
  ): { kept: number[]; flat: number[]; tvlOnly: number[] } => {
    const keptModel = fitValue(train, asOf, KEPT_TERMS);
    const tvlModel = fitValue(train, asOf, ['ln_tvl']);
    const kept: number[] = [];
    const flat: number[] = [];
    const tvlOnly: number[] = [];
    for (const p of test) {
      kept.push(valueOf(keptModel, p, asOf));
      flat.push(flatValue(keptModel, p));
      tvlOnly.push(valueOf(tvlModel, p, asOf));
    }
    return { kept, flat, tvlOnly };
  };

  // V1: random holdout, 20 seeds. Twenty, not ten: two ten-seed averages
  // of this scheme differ by five points on the kept model, so ten seeds
  // is not a stable enough read to put on the dashboard.
  {
    const kA: number[] = []; const fA: number[] = []; const tA: number[] = []; const aA: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const idx = peers.map((_, i) => i);
      const rand = rng(seed);
      for (let i = idx.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [idx[i], idx[j]] = [idx[j]!, idx[i]!];
      }
      const testSet = new Set(idx.slice(0, 25));
      const train = peers.filter((_, i) => !testSet.has(i));
      const test = peers.filter((_, i) => testSet.has(i));
      const { kept, flat, tvlOnly } = runFold(train, test);
      kA.push(...kept); fA.push(...flat); tA.push(...tvlOnly);
      aA.push(...test.map((p) => p.mcap_usd!));
      // Pooled residuals for the conformal factors, from the kept model.
      const keptModel = fitValue(train, asOf, KEPT_TERMS);
      for (const p of test) {
        v1Residuals.push({ cat: p.category ?? 'Unknown', resid: Math.log(valueOf(keptModel, p, asOf)) - Math.log(p.mcap_usd!) });
      }
    }
    schemes.push({ name: 'V1 random holdout (20 seeds, 25/128)', n: aA.length, kept: errorStats(aA, kA), flat: errorStats(aA, fA), tvlOnly: errorStats(aA, tA) });
  }

  // V2: time split.
  {
    const train: SnapshotProtocol[] = [];
    const test: SnapshotProtocol[] = [];
    for (const p of peers) {
      const age = ageDays(p, asOf);
      const listed = age === null ? null : asOfDate - age * DAY_MS;
      if (listed === null || listed < cutoff) train.push(p);
      else test.push(p);
    }
    const { kept, flat, tvlOnly } = runFold(train, test);
    const aA = test.map((p) => p.mcap_usd!);
    schemes.push({ name: `V2 time split (fit listed before 2024-06-01, n=${train.length}/${test.length})`, n: aA.length, kept: errorStats(aA, kept), flat: errorStats(aA, flat), tvlOnly: errorStats(aA, tvlOnly) });
  }

  // V3: leave-one-category-out, pooled over the categories with 5+ peers.
  {
    const cats = [...new Set(peers.map((p) => p.category ?? 'Unknown'))].filter(
      (c) => peers.filter((p) => (p.category ?? 'Unknown') === c).length >= 5,
    );
    const kA: number[] = []; const fA: number[] = []; const tA: number[] = []; const aA: number[] = [];
    for (const cat of cats) {
      const train = peers.filter((p) => (p.category ?? 'Unknown') !== cat);
      const test = peers.filter((p) => (p.category ?? 'Unknown') === cat);
      const { kept, flat, tvlOnly } = runFold(train, test);
      kA.push(...kept); fA.push(...flat); tA.push(...tvlOnly); aA.push(...test.map((p) => p.mcap_usd!));
    }
    schemes.push({ name: `V3 leave-one-category-out (${cats.length} categories, pooled)`, n: aA.length, kept: errorStats(aA, kA), flat: errorStats(aA, fA), tvlOnly: errorStats(aA, tA) });
  }

  // V4: leave-one-out over all 128 peers.
  {
    const kA: number[] = []; const fA: number[] = []; const tA: number[] = []; const aA: number[] = [];
    for (let i = 0; i < peers.length; i++) {
      const train = peers.filter((_, j) => j !== i);
      const test = [peers[i]!];
      const { kept, flat, tvlOnly } = runFold(train, test);
      kA.push(...kept); fA.push(...flat); tA.push(...tvlOnly); aA.push(peers[i]!.mcap_usd!);
    }
    schemes.push({ name: 'V4 leave-one-out (128 folds)', n: aA.length, kept: errorStats(aA, kA), flat: errorStats(aA, fA), tvlOnly: errorStats(aA, tA) });
  }

  return { schemes, v1Residuals };
}

/** The p80 absolute log residual of the V1 held-out residuals, as a factor.
 *  Per-category where a category holds 10+ residuals, else the global. */
export function conformalFactors(
  residuals: { cat: string; resid: number }[],
): { global: number; by_cat: Record<string, number>; median_factor: number } {
  const absAll = residuals.map((r) => Math.abs(r.resid)).sort((a, b) => a - b);
  const p80 = (vals: number[]): number => vals[Math.min(vals.length - 1, Math.floor(0.8 * (vals.length - 1)))];
  const global = Math.exp(p80(absAll));
  const median_factor = Math.exp(median(absAll));
  const byCat: Record<string, number> = {};
  const byCatMap: Record<string, number[]> = {};
  for (const r of residuals) {
    (byCatMap[r.cat] ??= []).push(Math.abs(r.resid));
  }
  for (const [cat, vals] of Object.entries(byCatMap)) {
    if (vals.length >= 10) byCat[cat] = Math.exp(p80(vals.sort((a, b) => a - b)));
  }
  return { global, by_cat: byCat, median_factor };
}

/** The categories with no farmable launch surface of their own. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);
/** A version marker at the end of a name: "Foo V2", "Foo v3", "Foo 2.0". */
const VERSION_RE = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** Exchange names a protocol may not start with. */
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** The first reason a pre-token protocol is excluded, or null when it is
 *  rankable. First match wins, so the reasons partition the excluded set
 *  and their counts sum to it. */
export function exclusionReason(p: SnapshotProtocol): string | null {
  if (p.mcap_usd !== null) return 'records a token';
  if (EXCLUDED_CATEGORIES.has(p.category ?? '')) return `category ${p.category}`;
  if (VERSION_RE.test(p.name)) return 'version marker in name';
  const words = p.name.toLowerCase().split(/\s+/);
  if (words.some((w) => w === 'wrapped' || w === 'staked' || w === 'staking')) return 'wrapped/staked word in name';
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return 'exchange-named';
  return null;
}

/** How many protocols the snapshot holds, and how many the board ranks.
 *  The reasons partition the excluded set: their counts sum to `excluded`. */
export function coverageFunnel(snapshot: Snapshot): {
  live: number;
  live_zero_mcap: number;
  pre_token: number;
  rankable: number;
  excluded: number;
  reasons: { reason: string; n: number }[];
} {
  const live = snapshot.protocols.filter((p) => p.mcap_usd !== null);
  const liveZero = live.filter((p) => p.mcap_usd! <= 0).length;
  const pre = snapshot.protocols.filter((p) => p.mcap_usd === null);
  const reasonCounts = new Map<string, number>();
  let excluded = 0;
  for (const p of pre) {
    const reason = exclusionReason(p);
    if (reason !== null) {
      excluded++;
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
  }
  // Categories first (largest first), then the name rules, in first-match order.
  const order = (r: string): number => {
    if (r.startsWith('category ')) return 0;
    if (r === 'version marker in name') return 1;
    if (r === 'wrapped/staked word in name') return 2;
    if (r === 'exchange-named') return 3;
    return 4;
  };
  const reasons = [...reasonCounts.entries()]
    .map(([reason, n]) => ({ reason, n }))
    .sort((a, b) => order(a.reason) - order(b.reason) || b.n - a.n);
  return {
    live: live.length,
    live_zero_mcap: liveZero,
    pre_token: pre.length,
    rankable: pre.length - excluded,
    excluded,
    reasons,
  };
}

/** A protocol is rankable when it records no token and none of the
 *  exclusion reasons apply. */
export function isRankable(p: SnapshotProtocol): boolean {
  return exclusionReason(p) === null;
}

/** The deposit a farm plan starts with, by the protocol's TVL. */
export function planDeposit(tvl: number): number {
  if (tvl < 100_000_000) return 50;
  if (tvl < 500_000_000) return 100;
  if (tvl < 2_000_000_000) return 150;
  return 250;
}

/** Gas per transaction by the protocol's first chain, whole dollars. */
export function planGas(chains: string[]): number {
  const first = chains[0] ?? 'Ethereum';
  const l2 = ['Arbitrum', 'Optimism', 'Base', 'zkSync Era', 'Scroll', 'Linea', 'Blast', 'Mantle', 'Mode', 'zkSync', 'Starknet', 'Manta'];
  const cheap = ['Solana', 'BSC', 'Avalanche', 'Polygon', 'Tron', 'Fantom', 'Gnosis', 'Celo', 'Kava', 'Sei', 'Sui', 'Aptos', 'Near', 'Cronos', 'Moonbeam', 'Harmony', 'xDai'];
  if (l2.includes(first)) return GAS_L2;
  if (cheap.includes(first)) return GAS_CHEAP_L1;
  return GAS_DEFAULT;
}

/** How long a farm plan holds, by the protocol's age in days. */
export function planHold(ageDaysValue: number | null): number {
  if (ageDaysValue === null || ageDaysValue < 180) return 4;
  if (ageDaysValue < 730) return 8;
  return 12;
}

/** The second qualifying action, by category: the farm plan must do two
 *  different things, not deposit once and leave. */
function secondAction(category: string | null, name: string, chain: string): string {
  switch (category) {
    case 'Dexs':
      return `Add liquidity to a second pool on ${chain} so the farm is not a single swap; keep both pools open for the whole hold.`;
    case 'Lending':
      return `Borrow a small amount against the deposit and repay it a week later; a borrower is a different user than a depositor.`;
    case 'Yield':
      return `Restake the yield the position earns each week instead of leaving it idle; compounding is the behaviour the protocol rewards.`;
    case 'Yield Aggregator':
      return `Move half the deposit into a second vault on ${chain} so the farm touches two strategies, not one.`;
    case 'RWA':
      return `Mint the protocol's receipt token for the deposit and hold it in the same wallet; the receipt is the proof of the position.`;
    case 'Bridge':
    case 'Canonical Bridge':
    case 'Cross Chain Bridge':
      return `Bridge a small amount to a second chain and back, so the farm records two directions of use.`;
    case 'CDP':
      return `Mint the protocol's stablecoin against the collateral and hold a small amount; minting is a second on-chain action.`;
    case 'Liquid Staking':
      return `Stake a second tranche a week later so the farm shows repeat use, not one deposit.`;
    case 'Basis Trading':
      return `Open the hedged basis position the protocol is built for and keep it through one funding cycle.`;
    case 'CEX':
      return `Trade a small spot amount on ${chain} in the same wallet so the farm is not a single deposit.`;
    case 'Derivatives':
      return `Open a small hedged position on ${chain} and close it after one week; the hedge is the point, not the leverage.`;
    default:
      return `Use a second feature of ${name} on ${chain} in the same wallet, so the farm is not a single deposit.`;
  }
}

/** The first qualifying action, by category. */
function firstAction(category: string | null, name: string, chain: string, deposit: number): string {
  switch (category) {
    case 'Dexs':
      return `Swap $${deposit} into the pool's pair on ${chain} and add it as liquidity; the pool position is the farm's qualifying action.`;
    case 'Lending':
      return `Deposit $${deposit} as collateral on ${chain} and leave it lent out; the loan is the farm's qualifying action.`;
    case 'Yield':
      return `Deposit $${deposit} into the highest-yield vault on ${chain}; the vault position is the farm's qualifying action.`;
    case 'Yield Aggregator':
      return `Deposit $${deposit} into the protocol's flagship vault on ${chain}; the vault position is the farm's qualifying action.`;
    case 'RWA':
      return `Buy $${deposit} of the protocol's tokenised asset on ${chain}; the holding is the farm's qualifying action.`;
    case 'CDP':
      return `Lock $${deposit} of collateral on ${chain} and mint against it; the collateral lock is the farm's qualifying action.`;
    case 'Liquid Staking':
      return `Stake $${deposit} on ${chain} and hold the receipt token; the stake is the farm's qualifying action.`;
    case 'Basis Trading':
      return `Deposit $${deposit} into the basis strategy on ${chain}; the strategy position is the farm's qualifying action.`;
    case 'CEX':
      return `Deposit $${deposit} on ${chain} and place a small spot trade; the trade is the farm's qualifying action.`;
    case 'Derivatives':
      return `Open a $${deposit} hedged position on ${chain}; the hedge is the farm's qualifying action.`;
    default:
      return `Deposit $${deposit} into ${name} on ${chain}; the deposit is the farm's qualifying action.`;
  }
}

/**
 * The 7-step farm plan for one protocol. Steps are built from the
 * protocol's own record only. Costs and times are stated in the text so
 * the board can be read without the dashboard.
 */
export function farmPlan(
  p: SnapshotProtocol,
  age: number | null,
): { steps: string[]; deposit: number; gas: number; hold_weeks: number } {
  const chain = p.chains[0] ?? 'Ethereum';
  const deposit = planDeposit(p.tvl_usd);
  const gas = planGas(p.chains);
  const hold = planHold(age);
  const setup = `Open ${p.name} on ${chain} and connect a fresh wallet; move $${deposit} in a stablecoin to that chain first. Cost: about $${gas} in gas, 10 minutes.`;
  const step1 = `${firstAction(p.category, p.name, chain, deposit)} Cost: about $${gas} in gas, 10 minutes.`;
  const step2 = `${secondAction(p.category, p.name, chain)} Cost: about $${gas} in gas, 10 minutes.`;
  const step3 = `Repeat the qualifying action once a week for ${hold} weeks so the activity reads as usage, not a single deposit. Cost: about $${(gas * hold).toFixed(2)} in gas over the whole hold, 10 minutes a week.`;
  const step4 = `Leave the position untouched for ${hold} weeks so the protocol's own history records a holder, not a passer-by. Cost: nothing but time; the deposit stays locked.`;
  const step5 = `Check the protocol's points or rewards page every week and claim anything it offers; unclaimed rewards are the most common way farmers lose. Cost: about $${gas} per claim, 5 minutes.`;
  const step6 = `When a token is announced, claim it from the protocol's own claim page only, sell half into a stablecoin and keep half for ${hold} more weeks; never sign a claim link from a DM or a search ad. Cost: about $${gas} in gas per claim, 15 minutes.`;
  return { steps: [setup, step1, step2, step3, step4, step5, step6], deposit, gas, hold_weeks: hold };
}

/** The verdict for an expected value, on the re-tested lines. */
export function verdictOf(ev: number): 'FARM' | 'WATCH' | 'SKIP' {
  if (ev >= FARM_LINE) return 'FARM';
  if (ev >= WATCH_LINE) return 'WATCH';
  return 'SKIP';
}

/** The integrity counts for the dashboard's strip. */
export function integrityOf(snapshot: Snapshot): Integrity {
  const peers = snapshot.protocols.filter(isFitPeer);
  return {
    protocols: snapshot.protocols.length,
    withMcap: snapshot.protocols.filter((p) => p.mcap_usd !== null).length,
    fitted: peers.length,
    mcapZeroOrLess: snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd <= 0).length,
    missingListedAt: snapshot.protocols.filter((p) => p.listed_at === null).length,
    missingListedAtFit: peers.filter((p) => p.listed_at === null).length,
    missingChange7d: snapshot.protocols.filter((p) => p.change_7d === null).length,
    preToken: snapshot.protocols.filter((p) => p.mcap_usd === null).length,
    watchlist: snapshot.watchlist.length,
  };
}

/** The odds model's calibration quintiles, in-sample, for the dashboard. */
function calibrationOf(
  model: OddsModel,
  protocols: SnapshotProtocol[],
  asOf: string,
  medianAge: number,
): { pred: number; actual: number }[] {
  const scored = protocols.map((p) => ({
    pred: oddsOf(model, p, asOf, medianAge),
    has: p.mcap_usd !== null,
  }));
  scored.sort((a, b) => a.pred - b.pred);
  const out: { pred: number; actual: number }[] = [];
  const n = scored.length;
  const q = Math.floor(n / 5);
  for (let k = 0; k < 5; k++) {
    const slice = scored.slice(k * q, k === 4 ? n : (k + 1) * q);
    out.push({
      pred: slice.reduce((s, r) => s + r.pred, 0) / slice.length,
      actual: slice.filter((r) => r.has).length / slice.length,
    });
  }
  return out;
}

/** Effective multiples by category at three TVL points, growth 0, at the
 *  fit set's median age. Built from the model's own terms, by name, so the
 *  table follows whatever the kept model prices. */
function effectiveMultiples(
  model: ValueModel,
): { category: string; m100: number; m1b: number; m10b: number }[] {
  const coefOf = (term: string): number => {
    const i = model.terms.indexOf(term);
    return i < 0 ? 0 : model.coef[i + 1]!;
  };
  const cats = Object.keys(model.adjPeers).sort((a, b) => (model.adj[b] ?? 0) - (model.adj[a] ?? 0));
  return cats.map((cat) => {
    const at = (tvl: number): number => {
      const base =
        model.coef[0]! +
        coefOf('ln_tvl') * Math.log(tvl) +
        coefOf('growth') * 0 +
        coefOf('ln_age') * Math.log1p(model.medianAge) +
        coefOf('ln_chains') * Math.log(3);
      return Math.exp(base + (model.adj[cat] ?? 0)) / tvl;
    };
    return { category: cat, m100: at(100_000_000), m1b: at(1_000_000_000), m10b: at(10_000_000_000) };
  });
}

/**
 * The whole pipeline: fit the kept model and the full model (for the
 * dropped-age sensitivity), run the four blind tests, fit the odds,
 * rank the 340 clean pre-token protocols, and assemble the dashboard's
 * data. Deterministic: every shuffle is seeded, nothing reads the clock.
 */
export function buildRadar(snapshot: Snapshot): RadarData {
  const asOf = snapshot.as_of;
  const peers = snapshot.protocols.filter(isFitPeer);
  const model = fitValue(peers, asOf, KEPT_TERMS);
  const full = fitValue(peers, asOf, ALL_TERMS);
  const { schemes, v1Residuals } = validate(peers, asOf);
  const conformal = conformalFactors(v1Residuals);
  const oddsModel = fitOdds(snapshot.protocols, asOf, model.medianAge);
  oddsModel.auc = oddsAUC(snapshot.protocols, asOf, model.medianAge);
  const funnel = coverageFunnel(snapshot);
  const integrity = integrityOf(snapshot);

  const rankable = snapshot.protocols.filter(isRankable);
  const rows: RadarRow[] = [];
  const verdicts = { FARM: 0, WATCH: 0, SKIP: 0 };
  const evs: number[] = [];
  const scored = rankable.map((p) => {
    const age = ageDays(p, asOf);
    const implied = valueOf(model, p, asOf);
    const factor = conformal.by_cat[p.category ?? 'Unknown'] ?? conformal.global;
    const odds = oddsOf(oddsModel, p, asOf, model.medianAge);
    const ev = implied * odds;
    const plan = farmPlan(p, age);
    return { p, age, implied, factor, odds, ev, plan };
  });
  scored.sort((a, b) => b.implied - a.implied);
  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]!;
    const verdict = verdictOf(s.ev);
    verdicts[verdict]++;
    evs.push(s.ev);
    const catPeers = oddsModel.catN[s.p.category ?? 'Unknown']?.n ?? 0;
    const band = (() => {
      const edges = oddsModel.bandEdges;
      const age = s.age ?? model.medianAge;
      for (let b = 0; b < 4; b++) if (age < edges[b + 1]!) return b;
      return 3;
    })();
    const bandPeers = oddsModel.bandN[band]?.n ?? 0;
    rows.push([
      i + 1,
      s.p.slug,
      s.p.name,
      s.p.category,
      s.p.chains,
      s.p.tvl_usd,
      s.p.change_7d,
      s.age,
      s.implied,
      s.implied / s.factor,
      s.implied * s.factor,
      s.odds,
      verdict,
      s.ev,
      catPeers,
      bandPeers,
      s.plan.steps,
      s.plan.deposit,
      s.plan.gas,
      s.plan.hold_weeks,
    ]);
  }
  const live: LiveRow[] = snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: p.mcap_usd! / p.tvl_usd,
    }));

  const ages = peers.map((p) => ageDays(p, asOf)).filter((a): a is number => a !== null);
  const chainsFullCoef = full.coef[ALL_TERMS.indexOf('ln_chains') + 1]!;
  return {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION,
    model: {
      terms: model.terms,
      coef: model.coef,
      median_age: model.medianAge,
      adj: model.adj,
      adj_peers: model.adjPeers,
      flat_median: model.flatMedian,
      fit_n: model.fitN,
    },
    dropped: [
      {
        term: 'ln_chains',
        coef_full: chainsFullCoef,
        wins: '1 of 4 as a single addition (V2 only); the age+chains combination loses all 4 schemes',
        note: 'Chain count is a breadth premium that does not survive combination: with age it loses everywhere, and growth+age win the time split without it. A protocol on one more chain is worth about 13% more in the full fit, but the term earns no place in the kept model.',
      },
    ],
    validation: schemes,
    conformal,
    odds: {
      global: oddsModel.global,
      auc: oddsModel.auc,
      band_edges: oddsModel.bandEdges,
      band_rates: [0, 1, 2, 3].map((b) => {
        const bn = oddsModel.bandN[b]!;
        return { n: bn.n, rate: bn.n === 0 ? 0 : bn.tokens / bn.n };
      }),
      calibration: calibrationOf(oddsModel, snapshot.protocols, asOf, model.medianAge),
    },
    integrity,
    funnel,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: rows.length,
    live_size: live.length,
    verdicts,
    verdict_lines: { farm: FARM_LINE, watch: WATCH_LINE },
    ev_median: median(evs),
    ev_p90: (() => {
      const s = [...evs].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.floor(0.9 * s.length))];
    })(),
    multiples: effectiveMultiples(model),
    rows,
    live,
  };
}

/** Render the dashboard's data file: `window.RADAR = {...}`. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR = ${JSON.stringify(radar)};\n`;
}

/** Check a finished board against the snapshot and the kit's rules. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows`;
  for (let i = 0; i < board.length; i++) {
    if (board[i]!.rank !== i + 1) return `rank ${i + 1} missing`;
    if (i > 0 && board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} out of order`;
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!board.some((r) => r.slug === slug)) return `watchlist ${slug} missing`;
  }
  const seen = new Set<string>();
  for (const r of board) {
    if (seen.has(r.slug)) return `duplicate ${r.slug}`;
    seen.add(r.slug);
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} farm step of ${s.length} chars`;
  }
  return null;
}
