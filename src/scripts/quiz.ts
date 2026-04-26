import { romajiToHiragana } from './romaji';

const MAX_ATTEMPTS = 3;
const QUESTIONS_PER_TAB = 10;

export function shuffleChildren(container: Element) {
  const arr = Array.from(container.children);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  arr.forEach((c) => container.appendChild(c));
}

// FLIP animation helper — measures positions before/after, then animates
// elements from their old visual position to their new layout position.
const FLIP_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';
const FLIP_DURATION = 280;

function flipMove(elements: HTMLElement[], doMoves: () => void) {
  const firsts = elements.map((el) => el.getBoundingClientRect());
  doMoves();
  const moved: boolean[] = [];
  let anyMoved = false;
  elements.forEach((el, i) => {
    const last = el.getBoundingClientRect();
    const dx = firsts[i].left - last.left;
    const dy = firsts[i].top - last.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
      moved.push(false);
      return;
    }
    moved.push(true);
    anyMoved = true;
    // Use individual `translate` property so it composes with `rotate` (wobble)
    el.style.transition = 'none';
    el.style.translate = `${dx}px ${dy}px`;
    el.style.zIndex = '5';
  });
  if (!anyMoved) return;
  // Force reflow so the instant translate is committed before transitioning back
  void elements[0].offsetWidth;
  requestAnimationFrame(() => {
    elements.forEach((el, i) => {
      if (!moved[i]) return;
      el.style.transition = `translate ${FLIP_DURATION}ms ${FLIP_EASING}`;
      el.style.translate = '0 0';
      el.classList.add('block-wobbling');
    });
  });
  setTimeout(() => {
    elements.forEach((el, i) => {
      if (!moved[i]) return;
      el.style.transition = '';
      el.style.translate = '';
      el.style.zIndex = '';
      el.classList.remove('block-wobbling');
    });
  }, FLIP_DURATION + 40);
}

export function initInteractiveCards(panel: Element) {
  panel.querySelectorAll('.question-card[data-type="sentence-blocks"]').forEach((card) => {
    const pool = card.querySelector('.blocks-pool');
    if (pool) {
      card.querySelectorAll('.block-slot .block').forEach((b) => pool.appendChild(b));
      shuffleChildren(pool);
    }
    card.querySelectorAll('.block').forEach((b) => {
      (b as HTMLButtonElement).disabled = false;
    });
  });

  panel.querySelectorAll('.question-card[data-type="matching"]').forEach((card) => {
    card.querySelectorAll('.match-item').forEach((i) => {
      i.classList.remove('selected', 'matched', 'shake');
      (i as HTMLElement).style.height = '';
    });
    // Clear any existing ropes
    const ropesSvg = card.querySelector('.match-ropes');
    if (ropesSvg) ropesSvg.innerHTML = '';
    card.querySelectorAll('.match-col').forEach((col) => shuffleChildren(col));
    (card as HTMLElement).dataset.matched = '0';

    // Equalize match-item heights — JP side is naturally taller because of
    // furigana (<ruby><rt>) annotations. Measure the tallest, apply to all.
    requestAnimationFrame(() => {
      if ((card as HTMLElement).offsetParent === null) return;
      const items = card.querySelectorAll<HTMLElement>('.match-item');
      let maxH = 0;
      items.forEach((it) => {
        if (it.offsetHeight > maxH) maxH = it.offsetHeight;
      });
      if (maxH > 0) items.forEach((it) => { it.style.height = `${maxH}px`; });
    });
  });
}

export function selectRandomSubset(panel: Element, showAll = false) {
  const allCards = Array.from(panel.querySelectorAll('.question-card'));

  if (showAll || allCards.length <= QUESTIONS_PER_TAB) {
    let idx = 1;
    allCards.forEach((card) => {
      (card as HTMLElement).style.display = '';
      card.classList.remove('pool-hidden');
      const num = card.querySelector('.question-number');
      if (num) num.textContent = `Q${idx++}`;
    });
    return allCards;
  }

  const showCount = QUESTIONS_PER_TAB;
  const indices = allCards.map((_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const hideSet = new Set(indices.slice(showCount));
  let visibleIdx = 1;
  allCards.forEach((card, i) => {
    if (hideSet.has(i)) {
      (card as HTMLElement).style.display = 'none';
      card.classList.add('pool-hidden');
    } else {
      const num = card.querySelector('.question-number');
      if (num) num.textContent = `Q${visibleIdx++}`;
    }
  });

  return allCards.filter((_, i) => !hideSet.has(i));
}

export function getCorrectAnswerText(card: HTMLElement): string {
  if (card.dataset.type === 'multiple-choice') {
    const idx = parseInt(card.dataset.answer || '0');
    const btns = card.querySelectorAll('.option-btn');
    return btns[idx]?.innerHTML?.trim() || '';
  } else {
    if (card.dataset.display) return card.dataset.display;
    const answers: string[] = JSON.parse(card.dataset.answer || '[]');
    if (answers.length >= 2 && answers[0] !== answers[1]) {
      return `${answers[0]} (${answers[1]})`;
    }
    return answers[0] || '';
  }
}

interface WrongAnswer { question: string; correctAnswer: string }

function saveResults(quizSection: Element, wrongAnswers: WrongAnswer[], correctCount: number, totalCount: number) {
  const el = quizSection as HTMLElement;
  const partId = el.dataset.partId;
  const lessonId = el.dataset.lessonId;
  if (!partId || !lessonId) return;

  const key = `nihon-results-${lessonId}-${partId}`;
  const data = {
    wrong: wrongAnswers,
    correct: correctCount,
    total: totalCount,
    timestamp: Date.now(),
  };
  localStorage.setItem(key, JSON.stringify(data));
}

export function showResults(quizSection: Element, wrongAnswers: WrongAnswer[], correctCount: number, totalCount: number) {
  const container = quizSection.querySelector('.results-summary') as HTMLElement;
  if (!container) return;

  const pct = Math.round((correctCount / totalCount) * 100);
  let html = `<div class="results-header">
    <h3>Results</h3>
    <div class="results-stats">
      <span class="results-score">${correctCount} / ${totalCount}</span>
      <span class="results-pct ${pct === 100 ? 'perfect' : pct >= 70 ? 'good' : 'low'}">${pct}%</span>
    </div>
  </div>`;

  if (wrongAnswers.length === 0) {
    html += '<p class="results-perfect">Perfect score!</p>';
  } else {
    html += `<p class="results-label">${wrongAnswers.length} to review:</p><div class="results-list">`;
    for (const w of wrongAnswers) {
      html += `<div class="results-item">
        <div class="results-q">${w.question}</div>
        <div class="results-a">${w.correctAnswer}</div>
      </div>`;
    }
    html += '</div>';
  }

  container.innerHTML = html;
  container.classList.remove('hidden');
  container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  saveResults(quizSection, wrongAnswers, correctCount, totalCount);
}

export function setupQuiz(panel: Element) {
  let correct = 0;
  let answered = 0;
  let hardMode = false;
  const wrongAnswers: WrongAnswer[] = [];
  const visibleCards = selectRandomSubset(panel);
  initInteractiveCards(panel);
  let total = visibleCards.length;
  const scoreEl = panel.querySelector('.score');
  const quizSection = panel.querySelector('.quiz-section');
  const hardToggle = panel.querySelector('.hard-mode-toggle') as HTMLElement;

  function setScore(c: number, t: number) {
    if (!scoreEl) return;
    scoreEl.textContent = `${c} / ${t}`;
    const pct = t > 0 ? (c / t) * 100 : 0;
    (scoreEl as HTMLElement).style.setProperty('--progress', `${pct}%`);
    let state = '';
    if (c === t && t > 0) state = 'perfect';
    else if (c > 0) state = 'progress';
    if (state) (scoreEl as HTMLElement).dataset.state = state;
    else delete (scoreEl as HTMLElement).dataset.state;
  }

  setScore(0, total);

  function updateScore() {
    setScore(correct, total);
  }

  function checkComplete() {
    if (answered >= total && quizSection) {
      showResults(quizSection, wrongAnswers, correct, total);
    }
  }

  function getAttempts(card: Element): number {
    return parseInt((card as HTMLElement).dataset.attempts || '0');
  }
  function setAttempts(card: Element, n: number) {
    (card as HTMLElement).dataset.attempts = String(n);
  }

  function showFeedback(card: Element, isCorrect: boolean, attemptsUsed: number, correctAnswer?: string) {
    const fb = card.querySelector('.feedback') as HTMLElement;
    if (!fb) return;
    fb.classList.remove('hidden');

    if (isCorrect) {
      fb.innerHTML = 'Correct!';
      fb.className = 'feedback correct';
      card.classList.add('answered-correct');
      correct++;
      answered++;
    } else if (attemptsUsed >= MAX_ATTEMPTS) {
      const answer = correctAnswer || getCorrectAnswerText(card as HTMLElement);
      fb.innerHTML = `Answer: <span class="feedback-answer">${answer}</span>`;
      fb.className = 'feedback incorrect';
      card.classList.add('answered-incorrect');
      const questionText = card.querySelector('.question-text')?.innerHTML || '';
      wrongAnswers.push({ question: questionText, correctAnswer: answer });
      answered++;
    } else {
      const left = MAX_ATTEMPTS - attemptsUsed;
      fb.innerHTML = `Incorrect — ${left} ${left === 1 ? 'attempt' : 'attempts'} left`;
      fb.className = 'feedback retry';
      card.classList.remove('shake');
      void (card as HTMLElement).offsetWidth;
      card.classList.add('shake');
    }

    updateScore();
    checkComplete();
  }

  function isLocked(card: Element): boolean {
    return card.classList.contains('answered-correct') || card.classList.contains('answered-incorrect');
  }

  panel.querySelectorAll('.option-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.question-card') as HTMLElement;
      if (!card || isLocked(card)) return;

      const correctIdx = parseInt(card.dataset.answer || '0');
      const chosenIdx = parseInt((btn as HTMLElement).dataset.option || '0');
      const attempts = getAttempts(card) + 1;
      setAttempts(card, attempts);

      if (chosenIdx === correctIdx) {
        btn.classList.add('selected-correct');
        showFeedback(card, true, attempts);
      } else {
        btn.classList.add('selected-incorrect');
        if (attempts >= MAX_ATTEMPTS) {
          card.querySelectorAll('.option-btn').forEach((b) => {
            if (parseInt((b as HTMLElement).dataset.option || '0') === correctIdx) {
              b.classList.add('selected-correct');
            }
          });
        }
        showFeedback(card, false, attempts);
      }
    });
  });

  panel.querySelectorAll('.submit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.question-card') as HTMLElement;
      if (!card || isLocked(card)) return;

      const input = card.querySelector('.answer-input') as HTMLInputElement;
      if (!input || !input.value.trim()) return;

      const userInput = input.value.trim();
      const acceptedAnswers: string[] = JSON.parse(card.dataset.answer || '[]');
      const converted = romajiToHiragana(userInput);
      const attempts = getAttempts(card) + 1;
      setAttempts(card, attempts);

      const isCorrect = acceptedAnswers.some(
        (a) => a === userInput || a === converted || a.toLowerCase() === userInput.toLowerCase()
      );

      if (isCorrect) {
        showFeedback(card, true, attempts);
      } else if (attempts >= MAX_ATTEMPTS) {
        showFeedback(card, false, attempts);
      } else {
        showFeedback(card, false, attempts);
        input.value = '';
        input.focus();
      }
    });
  });

  panel.querySelectorAll('.answer-input').forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') {
        (input.closest('.question-card')?.querySelector('.submit-btn') as HTMLElement)?.click();
      }
    });
  });

  panel.querySelectorAll('.question-card[data-type="sentence-blocks"]').forEach((card) => {
    const pool = card.querySelector('.blocks-pool') as HTMLElement | null;
    if (!pool) return;

    card.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('.block') as HTMLButtonElement | null;
      if (!target || isLocked(card) || target.disabled) return;
      const parentSlot = target.parentElement;
      flipMove([target], () => {
        if (parentSlot && parentSlot.classList.contains('block-slot')) {
          pool.appendChild(target);
        } else {
          const emptySlot = card.querySelector('.block-slot:empty') as HTMLElement | null;
          if (emptySlot) emptySlot.appendChild(target);
        }
      });
    });

    const checkBtn = card.querySelector('.check-blocks-btn') as HTMLButtonElement | null;
    if (checkBtn) {
      checkBtn.addEventListener('click', () => {
        if (isLocked(card)) return;
        const slots = Array.from(card.querySelectorAll('.block-slot'));
        const expectedCount = parseInt((card as HTMLElement).dataset.answer || '0');
        if (slots.length !== expectedCount) return;

        const allFilled = slots.every((s) => s.children.length === 1);
        let isCorrect = allFilled;
        if (allFilled) {
          for (let i = 0; i < slots.length; i++) {
            const block = slots[i].firstElementChild as HTMLElement;
            if (parseInt(block.dataset.correctIndex || '-1') !== i) {
              isCorrect = false;
              break;
            }
          }
        }

        const attempts = getAttempts(card) + 1;
        setAttempts(card, attempts);

        if (isCorrect) {
          card.querySelectorAll('.block').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
          showFeedback(card, true, attempts);
        } else if (attempts >= MAX_ATTEMPTS) {
          card.querySelectorAll('.block').forEach((b) => { (b as HTMLButtonElement).disabled = true; });
          showFeedback(card, false, attempts);
        } else {
          showFeedback(card, false, attempts);
        }
      });
    }

    const resetBlocksBtn = card.querySelector('.reset-blocks-btn') as HTMLButtonElement | null;
    if (resetBlocksBtn) {
      resetBlocksBtn.addEventListener('click', () => {
        if (isLocked(card)) return;
        const blocks = Array.from(card.querySelectorAll<HTMLElement>('.block-slot .block'));
        if (blocks.length === 0) return;
        flipMove(blocks, () => {
          blocks.forEach((b) => pool.appendChild(b));
        });
      });
    }
  });

  panel.querySelectorAll('.question-card[data-type="matching"]').forEach((cardEl) => {
    const card = cardEl as HTMLElement;
    const grid = card.querySelector('.match-grid') as HTMLElement | null;
    const svg = grid?.querySelector('.match-ropes') as SVGElement | null;
    if (!grid || !svg) return;

    const SVG_NS = 'http://www.w3.org/2000/svg';

    let selectedJp: HTMLElement | null = null;
    let dragSource: HTMLElement | null = null;
    let dragSourceX = 0, dragSourceY = 0;
    let pointerStartX = 0, pointerStartY = 0;
    let activeRope: SVGPathElement | null = null;
    let dragMoved = false;

    function getEdge(item: HTMLElement, side: 'right' | 'left') {
      const r = item.getBoundingClientRect();
      const g = grid!.getBoundingClientRect();
      return {
        x: side === 'right' ? r.right - g.left : r.left - g.left,
        y: r.top + r.height / 2 - g.top,
      };
    }

    function ropeD(x1: number, y1: number, x2: number, y2: number) {
      const dx = x2 - x1;
      const sag = Math.max(6, Math.min(22, Math.abs(dx) * 0.16));
      const cy1 = y1 + sag;
      const cy2 = y2 + sag;
      return `M ${x1} ${y1} C ${x1 + dx * 0.4} ${cy1}, ${x2 - dx * 0.4} ${cy2}, ${x2} ${y2}`;
    }

    function checkComplete() {
      const matched = card.querySelectorAll('.match-item[data-side="jp"].matched').length;
      const totalPairs = parseInt(card.dataset.answer || '0');
      if (matched >= totalPairs) showFeedback(card, true, 1);
    }

    function lockMatch(source: HTMLElement, target: HTMLElement, rope: SVGPathElement) {
      source.classList.remove('selected');
      source.classList.add('matched');
      target.classList.add('matched');
      rope.classList.remove('rope-active');
      rope.classList.add('rope-matched');
      rope.dataset.pairId = source.dataset.pairId || '';
      checkComplete();
    }

    function snapBack(rope: SVGPathElement, srcX: number, srcY: number) {
      const m = rope.getAttribute('d')?.match(/([\d.-]+)\s+([\d.-]+)\s*$/);
      if (!m) { rope.remove(); return; }
      const endX = parseFloat(m[1]);
      const endY = parseFloat(m[2]);
      const start = performance.now();
      const dur = 260;
      rope.classList.add('rope-snapback');
      function tick(now: number) {
        const t = Math.min(1, (now - start) / dur);
        const e = 1 - Math.pow(1 - t, 3);
        const cx = endX + (srcX - endX) * e;
        const cy = endY + (srcY - endY) * e;
        rope.setAttribute('d', ropeD(srcX, srcY, cx, cy));
        if (t < 1) requestAnimationFrame(tick);
        else rope.remove();
      }
      requestAnimationFrame(tick);
    }

    function handleWrongPair(source: HTMLElement, target: HTMLElement) {
      const attempts = getAttempts(card) + 1;
      setAttempts(card, attempts);
      source.classList.add('shake');
      target.classList.add('shake');
      setTimeout(() => {
        source.classList.remove('shake', 'selected');
        target.classList.remove('shake');
      }, 350);
      if (attempts >= MAX_ATTEMPTS) {
        card.querySelectorAll('.match-item').forEach((i) => i.classList.add('matched'));
        showFeedback(card, false, attempts);
      }
    }

    function tapToPair(item: HTMLElement) {
      const side = item.dataset.side;
      const pairId = item.dataset.pairId;
      if (side === 'jp') {
        if (selectedJp === item) {
          item.classList.remove('selected');
          selectedJp = null;
        } else {
          card.querySelectorAll('.match-item[data-side="jp"].selected').forEach((b) => b.classList.remove('selected'));
          item.classList.add('selected');
          selectedJp = item;
        }
        return;
      }
      if (side !== 'meaning' || !selectedJp) return;
      if (selectedJp.dataset.pairId === pairId) {
        const sx = getEdge(selectedJp, 'right');
        const tx = getEdge(item, 'left');
        const rope = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
        rope.setAttribute('class', 'rope');
        rope.setAttribute('d', ropeD(sx.x, sx.y, tx.x, tx.y));
        svg!.appendChild(rope);
        lockMatch(selectedJp, item, rope);
        selectedJp = null;
      } else {
        const wrong = selectedJp;
        selectedJp = null;
        handleWrongPair(wrong, item);
      }
    }

    function onPointerDown(e: PointerEvent) {
      const item = (e.target as HTMLElement).closest('.match-item') as HTMLElement | null;
      if (!item || isLocked(card) || item.classList.contains('matched')) return;
      e.preventDefault();

      dragSource = item;
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      dragMoved = false;
      activeRope = null;

      const edge = getEdge(item, item.dataset.side === 'jp' ? 'right' : 'left');
      dragSourceX = edge.x;
      dragSourceY = edge.y;

      // Suppress scroll/zoom for the duration of the gesture (touch fallback)
      document.body.style.touchAction = 'none';
      document.addEventListener('pointermove', onPointerMove, { passive: false });
      document.addEventListener('pointerup', onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragSource) return;
      const dx = e.clientX - pointerStartX;
      const dy = e.clientY - pointerStartY;
      if (!dragMoved && Math.hypot(dx, dy) < 5) return;
      dragMoved = true;
      e.preventDefault();

      if (!activeRope) {
        activeRope = document.createElementNS(SVG_NS, 'path') as SVGPathElement;
        activeRope.setAttribute('class', 'rope rope-active');
        svg!.appendChild(activeRope);
        dragSource.classList.add('selected');
      }

      const g = grid!.getBoundingClientRect();
      const x = e.clientX - g.left;
      const y = e.clientY - g.top;
      activeRope.setAttribute('d', ropeD(dragSourceX, dragSourceY, x, y));
    }

    function onPointerUp(e: PointerEvent) {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      document.body.style.touchAction = '';

      const source = dragSource;
      const rope = activeRope;
      dragSource = null;
      activeRope = null;
      if (!source) return;

      if (!dragMoved) {
        if (rope) rope.remove();
        tapToPair(source);
        return;
      }
      if (!rope) return;

      const targetEl = (document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null)
        ?.closest('.match-item') as HTMLElement | null;

      const validTarget = !!(
        targetEl &&
        targetEl !== source &&
        targetEl.dataset.side !== source.dataset.side &&
        !targetEl.classList.contains('matched')
      );

      if (validTarget && targetEl!.dataset.pairId === source.dataset.pairId) {
        const targetSide = targetEl!.dataset.side === 'jp' ? 'right' : 'left';
        const t = getEdge(targetEl!, targetSide as 'right' | 'left');
        rope.classList.remove('rope-active');
        rope.setAttribute('d', ropeD(dragSourceX, dragSourceY, t.x, t.y));
        lockMatch(source, targetEl!, rope);
      } else {
        source.classList.remove('selected');
        if (validTarget) handleWrongPair(source, targetEl!);
        snapBack(rope, dragSourceX, dragSourceY);
      }
    }

    card.addEventListener('pointerdown', onPointerDown);

    // Recompute matched rope endpoints if the grid resizes (window resize, etc.)
    function redrawMatchedRopes() {
      svg!.querySelectorAll<SVGPathElement>('.rope-matched').forEach((rope) => {
        const pairId = rope.dataset.pairId;
        if (!pairId) return;
        const jp = card.querySelector(`.match-item[data-side="jp"][data-pair-id="${pairId}"]`) as HTMLElement | null;
        const meaning = card.querySelector(`.match-item[data-side="meaning"][data-pair-id="${pairId}"]`) as HTMLElement | null;
        if (!jp || !meaning) return;
        const a = getEdge(jp, 'right');
        const b = getEdge(meaning, 'left');
        rope.setAttribute('d', ropeD(a.x, a.y, b.x, b.y));
      });
    }
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(redrawMatchedRopes);
      ro.observe(grid);
    }
  });

  panel.querySelectorAll('.hint-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const hintText = btn.parentElement?.querySelector('.hint-text');
      if (hintText) {
        hintText.classList.toggle('hidden');
        btn.textContent = hintText.classList.contains('hidden') ? 'Show hint' : 'Hide hint';
      }
    });
  });

  function resetQuiz() {
    correct = 0;
    answered = 0;
    wrongAnswers.length = 0;
    const results = panel.querySelector('.results-summary') as HTMLElement;
    if (results) { results.classList.add('hidden'); results.innerHTML = ''; }
    panel.querySelectorAll('.question-card').forEach((card) => {
      (card as HTMLElement).style.display = '';
      card.classList.remove('answered-correct', 'answered-incorrect', 'pool-hidden', 'shake');
      setAttempts(card, 0);
      const fb = card.querySelector('.feedback') as HTMLElement;
      if (fb) { fb.classList.add('hidden'); fb.textContent = ''; fb.className = 'feedback hidden'; }
      card.querySelectorAll('.option-btn').forEach((b) => b.classList.remove('selected-correct', 'selected-incorrect'));
      const input = card.querySelector('.answer-input') as HTMLInputElement;
      if (input) input.value = '';
      const hintText = card.querySelector('.hint-text');
      const hintBtn = card.querySelector('.hint-btn');
      if (hintText) hintText.classList.add('hidden');
      if (hintBtn) hintBtn.textContent = 'Show hint';
    });
    const newVisible = selectRandomSubset(panel, hardMode);
    initInteractiveCards(panel);
    visibleCards.length = 0;
    visibleCards.push(...newVisible);
    total = newVisible.length;
    setScore(0, total);
  }

  if (hardToggle) {
    hardToggle.addEventListener('click', () => {
      hardMode = !hardMode;
      hardToggle.classList.toggle('active', hardMode);
      // (label stays "Hard" — only the active class changes)
      resetQuiz();
    });
  }

  panel.querySelector('.reset-btn')?.addEventListener('click', resetQuiz);
}

export function initTabsAndVideo() {
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetId = (tab as HTMLElement).dataset.tab;

      document.querySelectorAll('.tab').forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      document.querySelectorAll('.tab-panel').forEach((panel) => {
        const el = panel as HTMLElement;
        const isTarget = el.dataset.panel === targetId;

        if (!isTarget) {
          const iframe = el.querySelector('.video-player') as HTMLIFrameElement;
          if (iframe && iframe.src !== 'about:blank') {
            iframe.src = 'about:blank';
          }
        }

        el.classList.toggle('active', isTarget);

        if (isTarget) {
          const iframe = el.querySelector('.video-player') as HTMLIFrameElement;
          if (iframe && (!iframe.src || iframe.src === 'about:blank')) {
            iframe.src = `https://www.youtube.com/embed/${iframe.dataset.videoId}?start=${iframe.dataset.start}&end=${iframe.dataset.end}`;
          }
        }
      });
    });
  });

  document.querySelectorAll('.replay-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const el = btn as HTMLElement;
      const iframe = el.closest('.video-area')?.querySelector('.video-player') as HTMLIFrameElement;
      if (iframe && el.dataset.videoId) {
        iframe.src = `https://www.youtube.com/embed/${el.dataset.videoId}?start=${el.dataset.start}&end=${el.dataset.end}&autoplay=1`;
      }
    });
  });
}

export function initAll() {
  initTabsAndVideo();
  document.querySelectorAll('.tab-panel').forEach(setupQuiz);
}
