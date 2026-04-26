// Types mirroring AnkiConnect's JSON schemas.
// AnkiConnect API reference: https://foosoft.net/projects/anki-connect/

export interface AnkiConfig {
  endpoint: string;          // default 'http://localhost:8765'
  enabled: boolean;          // false = hide Anki UI everywhere
  deckFilter: string[];      // empty = all decks; otherwise allowlist of deck names
  lastSyncAt: number | null; // epoch ms
}

export interface AnkiDeckSummary {
  name: string;
  totalCards: number;
  dueCount: number;          // cards due today (new + learning + review)
}

// A card pulled from AnkiConnect with the fields we care about resolved.
export interface AnkiCard {
  cardId: number;
  noteId: number;
  deckName: string;
  due: number;               // negative for new cards (relative position), positive for due epoch
  fields: Record<string, string>; // field name → value (HTML stripped)
  tags: string[];
}

export interface AnkiCacheDeck {
  summary: AnkiDeckSummary;
  dueCards: AnkiCard[];
  fetchedAt: number;
}

export interface AnkiCache {
  decks: Record<string, AnkiCacheDeck>;
}

export type AnkiEase = 1 | 2 | 3 | 4; // Again, Hard, Good, Easy

export interface QueuedReview {
  cardId: number;
  ease: AnkiEase;
  queuedAt: number;
}

export type AnkiStatus = 'live' | 'cached' | 'offline' | 'unconfigured';
