// LLM prompt templates for the pilot. These are pasted into Claude/GPT/etc.
// alongside source material; the LLM returns a dual output (Nihongo bundle YAML
// + Anki notes JSON) that we then import.

const SHARED_HEADER = `You are generating Japanese learning content for **Nihongo**, a personal practice app, AND **Anki** flashcards. Your output is a DUAL bundle: one YAML for Nihongo, one JSON for Anki. The user is an English-speaking learner.

Output exactly TWO fenced code blocks, in this order, with the language tags below.`;

function dualOutputFormat(deckName: string, modelName: string, fieldNames: string[]): string {
  const fieldsExample = fieldNames.length > 0
    ? fieldNames.map((f) => `      "${f}": "..."`).join(',\n')
    : '      "Front": "...",\n      "Back": "..."';
  const fieldsList = fieldNames.length > 0 ? fieldNames.join(', ') : 'Front, Back';
  return `### Output format

\`\`\`yaml
# nihon-bundle
lesson:
  id: <kebab-case-id>
  title: "<short English title>"
  description: "<one-line>"
  source: "<source attribution>"
  videoId: ""
  number: ""
  coverEmoji: "<single Japanese character thematic to the topic, e.g. 食 for food, 家 for family, 駅 for stations, 雨 for weather>"  # REQUIRED — Nihongo auto-renders a styled cover from this
  sections:
    - id: <section-id>
      title: "..."
      description: "..."
      parts:
        - id: <part-id>
          title: "..."
          startTime: 0
          endTime: 0
questions:
  <part-id>:
    - type: matching | sentence-blocks | free-input | multiple-choice
      question: "..."
      # type-specific fields (see Nihongo question schema)
      hint: "..."
\`\`\`

\`\`\`json
{
  "deckName": "${deckName}",
  "modelName": "${modelName}",
  "tags": ["nihon-pilot", "<topic-tag>"],
  "notes": [
    { "fields": {
${fieldsExample}
    } }
  ]
}
\`\`\`

**IMPORTANT for Anki JSON:**
- \`deckName\` MUST be exactly: \`"${deckName}"\`
- \`modelName\` MUST be exactly: \`"${modelName}"\`
- \`fields\` MUST use these exact keys (no others): **${fieldsList}**
- For each note, fill in every applicable field. If a field is irrelevant for an item (e.g. "Audio", "Notes"), set it to an empty string \`""\` rather than omitting it.
- For ID-like fields (if present), generate a unique kebab-slug like \`pilot-<topic>-<index>\`.
- For sentence/example fields, write a natural Japanese sentence with the target word.`;
}

const NIHON_QUESTION_SCHEMA = `### Nihongo question types — schema

- **matching**: \`pairs: [{ jp, meaning }]\` (3-7 pairs per question, batch by theme)
- **sentence-blocks**: \`blocks: [{ text }]\` in correct order, optional \`distractors: [{ text }]\`. One block = one word OR one particle.
- **free-input**: \`answers: [strings]\` (kanji + kana + romaji variants), optional \`display: "<HTML with ruby>"\`
- **multiple-choice**: \`options: [strings]\`, \`answer: <index>\`

Wrap kanji with \`<ruby>食<rt>た</rt></ruby>\` for furigana. Output in English (translations + UI strings).`;

export const PROMPT_FROM_SOURCE = (
  deckName: string,
  modelName: string,
  fieldNames: string[],
) => `${SHARED_HEADER}

## Mode: From source material

The user provides source material (book chapter, video transcript, vocab list…). Extract 5-15 vocabulary items + 3-8 example sentences. Generate:

1. **Nihongo bundle** with sections:
   - One \`matching\` exercise per 5-7 vocab items (group by theme if multiple themes)
   - One \`sentence-blocks\` exercise per example sentence (split into word+particle blocks, add 1-3 distractor particles)
   - Optional: 2-3 \`free-input\` for tricky vocab (EN↔JP)

2. **Anki notes**: one note per vocabulary item, slotting into the user's existing card model.

${NIHON_QUESTION_SCHEMA}

${dualOutputFormat(deckName, modelName, fieldNames)}

After the two code blocks, add a 1-line "Notes:" with anything you skipped or chose ambiguously.

Now wait for the user to paste their source material.`;

export const PROMPT_PRODUCTION_DRILL = (vocabList: string) => `${SHARED_HEADER}

## Mode: Production drill on known vocab

The user has already memorized the vocab below in Anki (these cards are MATURE — interval ≥ 21 days). They want to drill *active production*: use these words in sentences, force recall in context.

### Vocab pool

${vocabList}

### Generate

A Nihongo bundle ONLY (no Anki notes — the cards already exist in Anki). Compose:
- 5-10 \`sentence-blocks\` exercises that USE 1-3 of the vocab items per sentence. Sentences should be natural Japanese (not stilted), grammatically rich (varying particles, tenses, structures).
- 1-2 \`free-input\` exercises asking the user to translate an English sentence into Japanese using a target word from the pool.

${NIHON_QUESTION_SCHEMA}

### Output

Output ONE fenced \`yaml\` code block with the Nihongo bundle. Do NOT output Anki JSON for this mode.

\`\`\`yaml
# nihon-bundle
lesson:
  id: production-<topic-or-date>
  title: "Production drill — <topic>"
  ...
\`\`\`

Now generate.`;

export const PROMPT_RESCUE_WEAK = (cardList: string) => `${SHARED_HEADER}

## Mode: Rescue weak cards

The user is struggling with the cards below (high lapse count or low ease in Anki). The standard Anki "Again → Good" loop isn't working — you need to attack these from MULTIPLE angles to break the block.

### Struggling cards

${cardList}

### Generate

A Nihongo bundle ONLY. For EACH struggling card, generate exercises in 2-3 different formats:
- One \`matching\` exercise grouping all struggling cards (or batches of 5)
- One \`free-input\` per card ("How do you say X?" + "What does Y mean?")
- One \`sentence-blocks\` per card placing it in a memorable sentence
- Optional: one \`multiple-choice\` per card with plausible distractors (similar-looking kanji or related-but-wrong meanings)

The goal is OVERLEARNING via variety. Same word, multiple angles, multiple sessions.

${NIHON_QUESTION_SCHEMA}

### Output

ONE \`yaml\` code block, lesson titled "Rescue — <topic>". No Anki JSON.

Now generate.`;
