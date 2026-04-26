# Authoring lessons & questions

How to add new content (lessons, sections, questions) to Nihongo.

## Where things live

```
src/data/lessons/
  <lessonId>/
    lesson.yaml              # lesson metadata + section/part outline
    questions/
      <partId>.yaml          # questions for one or more parts (keyed by partId)
```

- One folder per lesson (`<lessonId>` becomes the URL slug: `/lesson/<lessonId>`).
- A lesson groups **sections**; each section groups **parts** (rendered as tabs).
- A questions YAML file is a top-level **map** keyed by `partId`. Multiple parts can share a file or live in separate files — the loader merges them all.

## `lesson.yaml`

```yaml
id: shimamori-1                  # must match the folder name
title: "Shimamori — Chapter 1"   # shown in headers
description: "Family vocabulary"
source: "Shimamori (chapter 1, lesson 2)"
videoId: ""                      # YouTube ID; "" for non-video lessons
coverImage: shimamori.png        # optional: file in public/, used as cover
number: 1                        # optional: shown as a badge on the home card

sections:
  - id: family-neutral           # URL slug: /lesson/shimamori-1/family-neutral
    title: "Family — neutral form"
    description: "Terms used to talk about your own family"
    parts:
      - id: family-parents-neutral  # one tab per part; matches a key in a questions YAML
        title: "Parents"
        startTime: 0               # YouTube seconds; ignored when videoId is empty
        endTime: 0
      - id: family-siblings-neutral
        title: "Siblings"
        startTime: 0
        endTime: 0
```

Optional: a section with multiple parts automatically gets a "Test" tab if a `<sectionId>-test` key exists in the questions YAML (a pooled test combining items from all parts).

## The 4 question types

Each question lives under a `partId:` key in a YAML file inside `questions/`. Every question has a `type`, a `question` field (the prompt shown to the user), a `hint`, plus type-specific fields.

### 1. `multiple-choice` — pick the right answer among 2–4 options

Best for: grammar rules, irregular forms, "which conjugation is this?"

```yaml
te-form-irregular:
  - type: multiple-choice
    question: "What is the te-form of する?"
    options:
      - して
      - すって
      - しって
      - すて
    answer: 0                    # zero-indexed: 0 means the first option
    hint: "する is an irregular verb"
```

- `options`: 2 to 4 strings (HTML allowed: `<ruby>` tags work).
- `answer`: integer index into `options`.

### 2. `free-input` — type the answer

Best for: vocab recall (JP↔EN), conjugations to produce, fill-in-the-blank.

```yaml
vocab-ichidan:
  - type: free-input
    question: "How do you say \"to eat\" in Japanese?"
    answers:                      # any of these counts as correct
      - 食べる
      - たべる
      - taberu                    # romaji is auto-converted to hiragana
    display: "<ruby>食<rt>た</rt></ruby>べる"   # how to show the answer with furigana when revealed
    hint: "Ichidan verb (ru-verb)"
```

- `answers`: array of accepted strings. Romaji is converted to hiragana before comparison; comparison is case-insensitive.
- `display` (optional): HTML used when revealing the correct answer (lets you add `<ruby>` furigana that aren't in the typed answer).

### 3. `sentence-blocks` — assemble blocks in the right order

Best for: practising particle usage, sentence patterns, word order.

```yaml
basic-sentences:
  - type: sentence-blocks
    question: "My wife's name is Chloé."        # the EN prompt to translate
    blocks:                                    # list IN THE CORRECT ORDER; the UI shuffles
      - text: "<ruby>妻<rt>つま</rt></ruby>"
      - text: "の"
      - text: "<ruby>名前<rt>なまえ</rt></ruby>"
      - text: "は"
      - text: "クロエ"
      - text: "です"
    distractors:                               # optional: extra wrong-but-plausible blocks
      - text: "が"
      - text: "を"
    hint: "X の Y は Z です — introduction structure"
```

- `blocks`: list **in the correct order**. The renderer shuffles them in the UI.
- `distractors` (optional): extra blocks added to the pool to confuse — particles or wrong choices.
- Keep blocks fine-grained (one word or particle per block) to force the learner to think about particles.

### 4. `matching` — tap-to-pair JP ↔ meaning

Best for: vocabulary inside a same family/theme (5–6 related items).

```yaml
family-ichidan-1:
  - type: matching
    question: "Match each verb to its translation."
    pairs:
      - jp: "<ruby>食<rt>た</rt></ruby>べる"
        meaning: "to eat"
      - jp: "<ruby>見<rt>み</rt></ruby>る"
        meaning: "to see / to watch"
      - jp: "<ruby>起<rt>お</rt></ruby>きる"
        meaning: "to get up"
      - jp: "<ruby>寝<rt>ね</rt></ruby>る"
        meaning: "to sleep"
      - jp: "<ruby>着<rt>き</rt></ruby>る"
        meaning: "to wear (clothing)"
    hint: "All ichidan verbs"
```

- `pairs`: 3 to ~7 items. Both columns get shuffled independently in the UI.
- Keep `meaning` short — it's displayed in a button. Move long explanations into `hint`.

## Furigana / ruby annotations

Anywhere HTML is allowed (`question`, `options`, `display`, `blocks[].text`, `pairs[].jp`), use the standard `<ruby>` syntax to add furigana over kanji:

```html
<ruby>食<rt>た</rt></ruby>べる        <!-- character-by-character -->
<ruby>父親<rt>ちちおや</rt></ruby>     <!-- whole compound (simpler, less precise) -->
お<ruby>父<rt>とう</rt></ruby>さん    <!-- kanji surrounded by hiragana -->
```

Two conventions are in use across the codebase: per-kanji ruby (precise) for simple words, and whole-compound ruby (lazy but readable) for compounds where the per-kanji split isn't obvious. Either works.

## Scoring & runtime

All four types share the same scoring engine:
- 3 attempts max per card, then the answer is revealed.
- Each section has a "Hard" toggle that shows all questions instead of a 10-question random sample.
- Results (correct/wrong + the wrong items to review) are stored in `localStorage` under `nihon-results-<lessonId>-<partId>`.

You don't need to wire any of this — just write the YAML and the renderer takes care of the rest.

## Generating new content with an LLM

See [`LLM_PROMPT.md`](./LLM_PROMPT.md) for a copy-paste prompt to give to another LLM (Claude, GPT, etc.) along with either:
- a YouTube video transcript + chapters, or
- an Anki CSV/TSV vocab list,

and get back a ready-to-drop-in lesson + question files.

## Two formats — when to use which

Nihongo supports two equivalent formats for the same data:

### 1. Multi-file (this doc) — for repo-committed lessons

`lesson.yaml` + one or more `questions/<part>.yaml` in `src/data/lessons/<id>/`. Easier to edit by hand, version-control friendly, what all current built-in lessons use.

### 2. Bundle YAML — for in-app imports

A single YAML file with two top-level keys (`lesson:` and `questions:`) that combines everything. The user can paste it (or upload it) at `/imported/` to add the lesson to their localStorage. Use this format when you want to share a lesson without rebuilding/redeploying the site.

```yaml
# Bundle format
lesson:
  id: my-lesson
  title: "..."
  sections: [...]

questions:
  part-1: [ {...}, {...} ]
  part-2: [ {...} ]
```

Imported lessons appear on the home under the "Imported lessons" section, are stored in `localStorage` (key `nihon-imported-lessons`), and can be deleted from there. Quiz results for imports use the same `nihon-results-<lessonId>-<partId>` storage as built-in lessons.

The LLM prompt supports both modes — see [`LLM_PROMPT.md`](./LLM_PROMPT.md#output-mode--pick-one-of-two).
