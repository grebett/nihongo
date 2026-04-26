import type { AnkiCard } from './anki-types';
import type { Question } from './lessons';

// Common field name aliases (lowercased for matching).
const JP_KEYS = ['expression', 'japanese', 'front', 'word', 'kanji', 'jp', '表現'];
const READING_KEYS = ['reading', 'kana', 'furigana', 'pronunciation', '読み', 'よみ'];
const MEANING_KEYS = ['meaning', 'english', 'french', 'translation', 'definition', 'back', '意味'];

function pickField(card: AnkiCard, candidates: string[]): string | null {
  const fields = card.fields;
  const lowered = Object.fromEntries(
    Object.entries(fields).map(([k, v]) => [k.toLowerCase(), v]),
  );
  for (const c of candidates) {
    const v = lowered[c.toLowerCase()];
    if (v && v.trim()) return v.trim();
  }
  // Fallback: first non-empty field
  for (const v of Object.values(fields)) {
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function buildJpDisplay(jp: string, reading: string | null): string {
  if (!reading || jp === reading) return jp;
  // If the jp string contains no CJK ideograph (kanji), no need for ruby
  if (!/[一-鿿㐀-䶿]/.test(jp)) return jp;
  // Whole-word ruby (lazy but readable)
  return `<ruby>${jp}<rt>${reading}</rt></ruby>`;
}

export interface QuestionWithCards {
  question: Question;
  cardIds: number[];
}

/**
 * Convert Anki cards to Nihon questions. Strategy: batch into matching
 * exercises of `pairsPerBatch` cards each. Cards within a batch all get
 * the same ease when the matching exercise is answered.
 */
export function cardsToMatchingQuestions(
  cards: AnkiCard[],
  pairsPerBatch = 5,
): QuestionWithCards[] {
  const out: QuestionWithCards[] = [];
  const usable = cards
    .map((c) => {
      const jp = pickField(c, JP_KEYS);
      const reading = pickField(c, READING_KEYS);
      const meaning = pickField(c, MEANING_KEYS);
      if (!jp || !meaning) return null;
      return { card: c, jp, reading, meaning };
    })
    .filter((x): x is { card: AnkiCard; jp: string; reading: string | null; meaning: string } => x !== null);

  // Shuffle so each session feels different
  for (let i = usable.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [usable[i], usable[j]] = [usable[j], usable[i]];
  }

  for (let i = 0; i < usable.length; i += pairsPerBatch) {
    const slice = usable.slice(i, i + pairsPerBatch);
    if (slice.length < 2) continue; // matching needs ≥2 pairs
    const question: Question = {
      type: 'matching',
      question: 'Match each term to its translation.',
      pairs: slice.map((s) => ({
        jp: buildJpDisplay(s.jp, s.reading),
        meaning: s.meaning,
      })),
      hint: 'Anki batch',
    };
    out.push({
      question,
      cardIds: slice.map((s) => s.card.cardId),
    });
  }

  return out;
}
