import { invoke } from './anki';

// ─── Types ─────────────────────────────────────────────────────────────

export interface DeckStateBreakdown {
  deckName: string;
  total: number;
  newCount: number;
  learning: number;
  review: number;
  suspended: number;
  mature: number;       // interval >= 21d
}

export interface IntervalBucket {
  label: string;
  count: number;
}

export interface DayCount {
  date: string; // yyyy-mm-dd
  count: number;
}

export interface CollectionStats {
  decks: DeckStateBreakdown[];
  intervalDistribution: IntervalBucket[];
  forecast14: number[]; // due count for each of next 14 days (index 0 = today)
  reviewedByDay: DayCount[]; // last 30 days
  reviewedToday: number;
  streak: number; // consecutive days with at least 1 review (today included)
}

// ─── AnkiConnect raw data fetchers ──────────────────────────────────────

async function findCardCount(query: string): Promise<number> {
  const ids = await invoke<number[]>('findCards', { query });
  return ids.length;
}

async function deckStateBreakdown(deckName: string): Promise<DeckStateBreakdown> {
  const [total, newCount, learning, review, suspended, mature] = await Promise.all([
    findCardCount(`deck:"${deckName}"`),
    findCardCount(`deck:"${deckName}" is:new`),
    findCardCount(`deck:"${deckName}" is:learn`),
    findCardCount(`deck:"${deckName}" is:review`),
    findCardCount(`deck:"${deckName}" is:suspended`),
    findCardCount(`deck:"${deckName}" prop:ivl>=21 -is:new -is:learn`),
  ]);
  return { deckName, total, newCount, learning, review, suspended, mature };
}

const INTERVAL_BUCKETS: { label: string; min: number; max: number | null }[] = [
  { label: '< 1d',      min: 0,    max: 1 },
  { label: '1–7d',      min: 1,    max: 8 },
  { label: '8–30d',     min: 8,    max: 31 },
  { label: '31–90d',    min: 31,   max: 91 },
  { label: '91–365d',   min: 91,   max: 366 },
  { label: '> 1y',      min: 366,  max: null },
];

async function intervalDistribution(deckQuery: string): Promise<IntervalBucket[]> {
  const buckets = await Promise.all(
    INTERVAL_BUCKETS.map(async (b) => {
      const range = b.max
        ? `prop:ivl>=${b.min} prop:ivl<${b.max}`
        : `prop:ivl>=${b.min}`;
      const count = await findCardCount(`${deckQuery} ${range} -is:new`);
      return { label: b.label, count };
    }),
  );
  return buckets;
}

async function forecastNextDays(deckQuery: string, days = 14): Promise<number[]> {
  const counts = await Promise.all(
    Array.from({ length: days }, (_, i) =>
      findCardCount(`${deckQuery} prop:due=${i} -is:new -is:suspended`),
    ),
  );
  return counts;
}

interface ReviewLogEntry {
  reviewTime: number; // epoch ms
}

async function reviewsLastNDays(n = 30): Promise<DayCount[]> {
  // AnkiConnect's `getReviewsOfCards` is per-card; for whole-collection counts
  // by day we use `cardReviews` which returns logs for cards modified after a
  // timestamp. Fallback: query findCards for cards reviewed today via `rated:N`.
  const days: DayCount[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const count = await findCardCount(`rated:${i + 1}:1 OR rated:${i + 1}:2 OR rated:${i + 1}:3 OR rated:${i + 1}:4`);
    // `rated:N:E` matches cards rated with ease E in the last N days. We want EXACTLY day i,
    // so subtract day (i+1)'s count to isolate. But Anki's `rated:N` is "last N days inclusive".
    // Simpler: cumulative diff.
    const date = new Date(Date.now() - i * 24 * 3600 * 1000);
    days.push({ date: date.toISOString().slice(0, 10), count });
  }
  // Convert cumulative to per-day
  const perDay: DayCount[] = [];
  let prev = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const cum = days[i].count;
    perDay.unshift({ date: days[i].date, count: Math.max(0, cum - prev) });
    prev = cum;
  }
  return perDay;
}

async function reviewedToday(): Promise<number> {
  return findCardCount('rated:1');
}

async function computeStreak(reviewedByDay: DayCount[]): Promise<number> {
  // reviewedByDay is ordered oldest → newest. Streak = consecutive non-zero days at the tail.
  let streak = 0;
  for (let i = reviewedByDay.length - 1; i >= 0; i--) {
    if (reviewedByDay[i].count > 0) streak++;
    else break;
  }
  return streak;
}

// ─── Top-level aggregator ───────────────────────────────────────────────

export async function loadCollectionStats(deckNames: string[]): Promise<CollectionStats> {
  // Per-deck breakdown
  const decks = await Promise.all(deckNames.map((d) => deckStateBreakdown(d)));

  // Interval & forecast across ALL decks (sum). Single deck would be simpler;
  // for "all decks" we OR them in a query.
  const deckQuery = deckNames.length > 0
    ? `(${deckNames.map((d) => `deck:"${d}"`).join(' OR ')})`
    : '';
  const [intervalDist, forecast14, reviewedByDay, todayCount] = await Promise.all([
    intervalDistribution(deckQuery),
    forecastNextDays(deckQuery, 14),
    reviewsLastNDays(30),
    reviewedToday(),
  ]);
  const streak = await computeStreak(reviewedByDay);

  return {
    decks,
    intervalDistribution: intervalDist,
    forecast14,
    reviewedByDay,
    reviewedToday: todayCount,
    streak,
  };
}
