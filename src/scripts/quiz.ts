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
    });
    card.querySelectorAll('.match-col').forEach((col) => shuffleChildren(col));
    (card as HTMLElement).dataset.matched = '0';
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

  if (scoreEl) scoreEl.textContent = `0 / ${total}`;

  function updateScore() {
    if (scoreEl) scoreEl.textContent = `${correct} / ${total}`;
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
      fb.innerHTML = `Answer: ${answer}`;
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
      if (parentSlot && parentSlot.classList.contains('block-slot')) {
        pool.appendChild(target);
      } else {
        const emptySlot = card.querySelector('.block-slot:empty') as HTMLElement | null;
        if (emptySlot) emptySlot.appendChild(target);
      }
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
        card.querySelectorAll('.block-slot .block').forEach((b) => pool.appendChild(b));
      });
    }
  });

  panel.querySelectorAll('.question-card[data-type="matching"]').forEach((card) => {
    let selectedJp: HTMLElement | null = null;

    card.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest('.match-item') as HTMLElement | null;
      if (!item || isLocked(card) || item.classList.contains('matched')) return;

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
        selectedJp.classList.remove('selected');
        selectedJp.classList.add('matched');
        item.classList.add('matched');
        selectedJp = null;

        const matched = (card.querySelectorAll('.match-item[data-side="jp"].matched')).length;
        const totalPairs = parseInt((card as HTMLElement).dataset.answer || '0');
        if (matched >= totalPairs) {
          showFeedback(card, true, 1);
        }
      } else {
        const attempts = getAttempts(card) + 1;
        setAttempts(card, attempts);

        const wrongLeft = selectedJp;
        wrongLeft.classList.add('shake');
        item.classList.add('shake');
        setTimeout(() => {
          wrongLeft.classList.remove('shake', 'selected');
          item.classList.remove('shake');
        }, 350);
        selectedJp = null;

        if (attempts >= MAX_ATTEMPTS) {
          card.querySelectorAll('.match-item').forEach((i) => i.classList.add('matched'));
          showFeedback(card, false, attempts);
        }
      }
    });
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
    if (scoreEl) scoreEl.textContent = `0 / ${total}`;
  }

  if (hardToggle) {
    hardToggle.addEventListener('click', () => {
      hardMode = !hardMode;
      hardToggle.classList.toggle('active', hardMode);
      hardToggle.textContent = hardMode ? 'Hard' : 'Hard';
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
