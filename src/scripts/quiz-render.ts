import type { Question } from './lessons';

function escapeAttr(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function getCardAnswer(q: Question): string {
  if (q.type === 'multiple-choice') return String(q.answer ?? 0);
  if (q.type === 'free-input') return JSON.stringify(q.answers ?? []);
  if (q.type === 'sentence-blocks') return String((q.blocks ?? []).length);
  if (q.type === 'matching') return String((q.pairs ?? []).length);
  return '';
}

export function getCardDisplay(q: Question): string {
  if (q.display) return q.display;
  if (q.type === 'sentence-blocks') return (q.blocks ?? []).map((b) => b.text).join(' ');
  if (q.type === 'matching') return (q.pairs ?? []).map((p) => `${p.jp} — ${p.meaning}`).join(' · ');
  return '';
}

export function renderQuestionCard(q: Question, index: number): string {
  const answer = getCardAnswer(q);
  const display = getCardDisplay(q);

  let inner = '';
  if (q.type === 'multiple-choice') {
    const opts = (q.options ?? [])
      .map((opt, j) => `<button class="option-btn" data-option="${j}">${opt}</button>`)
      .join('');
    inner = `<div class="options">${opts}</div>`;
  } else if (q.type === 'free-input') {
    inner = `<div class="input-group">
      <input type="text" class="answer-input" placeholder="Type your answer..." autocomplete="off">
      <button class="submit-btn">Check</button>
    </div>`;
  } else if (q.type === 'sentence-blocks' && q.blocks) {
    const slots = q.blocks
      .map((_, si) => `<div class="block-slot" data-slot-index="${si}"></div>`)
      .join('');
    const allBlocks = [...q.blocks, ...(q.distractors ?? [])];
    const blockBtns = allBlocks
      .map(
        (b, bi) =>
          `<button class="block" data-correct-index="${bi < q.blocks!.length ? bi : -1}">${b.text}</button>`,
      )
      .join('');
    inner = `<div class="blocks-area">
      <div class="blocks-slots" data-slot-count="${q.blocks.length}">${slots}</div>
      <div class="blocks-pool">${blockBtns}</div>
      <div class="blocks-actions">
        <button class="check-blocks-btn">Check</button>
        <button class="reset-blocks-btn" type="button">Reset blocks</button>
      </div>
    </div>`;
  } else if (q.type === 'matching' && q.pairs) {
    const jpCol = q.pairs
      .map((p, pi) => `<button class="match-item" data-pair-id="${pi}" data-side="jp">${p.jp}</button>`)
      .join('');
    const meaningCol = q.pairs
      .map(
        (p, pi) =>
          `<button class="match-item" data-pair-id="${pi}" data-side="meaning">${escapeText(p.meaning)}</button>`,
      )
      .join('');
    inner = `<div class="match-grid">
      <svg class="match-ropes" aria-hidden="true"></svg>
      <div class="match-col" data-side="jp">${jpCol}</div>
      <div class="match-col" data-side="meaning">${meaningCol}</div>
    </div>`;
  }

  return `<div class="question-card" data-type="${q.type}" data-answer="${escapeAttr(answer)}" data-display="${escapeAttr(display)}">
    <div class="question-number">Q${index + 1}</div>
    <p class="question-text">${q.question}</p>
    ${inner}
    <div class="hint">
      <button class="hint-btn">Show hint</button>
      <p class="hint-text hidden">${escapeText(q.hint ?? '')}</p>
    </div>
    <div class="feedback hidden"></div>
  </div>`;
}
