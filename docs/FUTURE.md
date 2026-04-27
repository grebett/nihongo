# Future features — parking lot

Ideas explored in conversation but parked for later. Each entry has enough context to pick up cold.

---

## 1. Assimil XML extraction → Nihongo exercises

**Source data found** (Mac App Store install of Assimil):

```
~/Library/Containers/com.mantano.assimil/Data/Library/Application Support/
  com.mantano.assimil/assimil_resources/9782700564761/
    audio/   ja-jp/sans_peine/audio/prod/v0_05_12_2025/L<NNN>/S0X.mp3   (2532 files)
    xml/     ja-jp/sans_peine/3095/prod/v0_05_12_2025/method/lessons/L<NNN>.xml
```

ISBN `9782700564761` = *Le Japonais Sans Peine* (~100 lessons).

### XML structure (rich, fully tagged)

```xml
<lesson id="L001">
  <body>
    <dialog>
      <phrases id="L001DIALOG">
        <phrase id="L001P01" num="1">
          <tt audio="S01.mp3">
            <wd>
              <ruby>早<rt>はや</rt><trlit>ha ya</trlit></ruby>
              <ruby>く<trlit>ku</trlit></ruby>
            </wd>。
          </tt>
          <ph>hayakou</ph>                     <!-- French phonetic -->
          <trlat>Vite !</trlat>                 <!-- French translation -->
        </phrase>
      </phrases>
    </dialog>
    <notes>...</notes>                          <!-- Grammar notes referenced by notecall refid -->
  </body>
  <exercises>
    <x-trlat>...</x-trlat>                      <!-- Translation exercises with corrigé -->
  </exercises>
</lesson>
```

Per phrase: JP text reconstructible with full furigana + romaji + audio file ref + French translation + literal word-by-word + linked grammar notes.

### Mapping to Nihongo question types

- **sentence-blocks**: each `<wd>` = one block → user composes the JP from the FR prompt
- **free-input**: "How do you say X in Japanese?" with `answers: [kanji, kana, romaji]`, `display` = ruby HTML
- **matching**: extract recurring vocab across lessons → batched JP↔FR matching
- **multiple-choice**: particles, conjugations — distractors pulled from other lessons

### Architecture (proposed: Mode A — in-app via Pilot)

New "Assimil" tab in `/pilot`:

1. File picker (FS API or `<input type="file" multiple>`) → select one or several `L0XX.xml`
2. Parse client-side (DOMParser) → list phrases with checkboxes
3. Config: which exercise types to generate, particle exclusions, batch size for matching
4. Generate Nihongo bundle (and optionally Anki notes — see Audio section)
5. Import direct via the existing `saveImported` flow

### Architecture B (alternative — script Node one-shot)

`scripts/import-assimil.js` that batches all 100 lessons → outputs ready-to-commit YAML files in `src/data/lessons/assimil-jsp/`. Better for "I want everything in one go".

### Open questions when picking back up

- Per-lesson or per-section bundle? A whole lesson is ~7-10 phrases → fits in one bundle nicely
- Granularity UI: select phrases individually or just include all by default?
- Notes (`<notes>`) — surface as `hint` field? Or skip (very long usually)?

### Files to read first when resuming

- This doc
- `src/scripts/imported-lessons.ts` (`parseImportYaml`, `saveImported`, `bundleToFiles`)
- `src/scripts/pilot-prompts.ts` (existing Pilot prompt patterns)
- `src/pages/pilot.astro` (existing modes for reference)

---

## 2. Audio integration

Built on top of (1). Two scopes:

### 2a — Anki audio (low-effort)

When pushing notes via Pilot Mode A or Assimil mode:
- For the `Audio` field in the user's "Japonais V6" model, fill with `[sound:S01.mp3]` (Anki convention)
- Either pre-copy the relevant MP3s into `~/Library/Application Support/Anki2/<profile>/collection.media/` (via FS Access API on Mac)
- OR reference absolute paths (less portable but zero-copy)

### 2b — Nihongo in-browser audio

Extension of the question schema:
- Add optional `audio?: string` field to `Question`
- For `free-input`: an audio prompt button — "🔊 Listen, then type what you hear"
- For `matching`: audio cue on hover/tap of the JP side
- For `sentence-blocks`: play the target audio as the prompt (instead of the FR translation)

Hosting: copy MP3s into `public/audio/<lesson>/` for built-in lessons. For imports, data: URIs are too heavy — the bundle would balloon. Better: imported lessons reference an external URL (cloudflare R2, GitHub LFS, etc.) — not free. Phase 1 = local-dev only, no public hosting.

**Copyright note**: Assimil audio is copyrighted. Personal use OK, public deploy = no.

---

## 3. Pronunciation analysis (shadowing)

User records themselves saying a JP phrase, app compares spectrally to the native audio.

### Metrics (in priority order for Japanese)

1. **F0 (pitch)** — *critical for Japanese* (pitch accent). Curve overlay = strong pedagogical signal
2. **Tempo / durée des morae** — rhythm, syllable timing
3. **Énergie / intensité** — accent placement
4. **Formants F1/F2** — vowel quality (e.g. /u/ JP vs /u/ FR)
5. **MFCC** — global similarity, opaque to the user but useful for an aggregate score

### Browser stack (no Praat needed)

| Need | Lib |
|------|-----|
| Mic capture | Web Audio API + `navigator.mediaDevices.getUserMedia` |
| FFT / spectrogram | Web Audio `AnalyserNode` or [WaveSurfer.js](https://wavesurfer-js.org/) |
| Pitch tracking | [Pitchfinder](https://github.com/peterkhayes/pitchfinder) (YIN/PYIN/AMDF) |
| MFCC / spectral features | [Meyda](https://meyda.js.org/) |
| Custom DSP loop | `AudioWorklet` for low-latency real-time |

All ~50-100KB combined. No backend needed.

### UX sketch

- "🎙 Record & compare" button on a phrase (Nihongo question or Assimil sentence)
- Flow:
  1. Native audio plays (referenced from Assimil MP3 path or recorded)
  2. User records their attempt (3 takes max)
  3. Display: 2 spectrograms side-by-side + 2 pitch curves overlaid
  4. Aggregate score (0-100) + targeted feedback ("ton intonation descend trop tôt sur ね", "voyelle /u/ trop labiale")

### Where it lives

New question type `pronunciation` OR a global "shadowing" feature on top of any phrase that has audio. Probably the latter — less invasive.

### Files to bootstrap

- New `src/scripts/audio-analysis.ts` with pitch/MFCC helpers
- Component for spectrogram visualization (SVG or canvas)
- Question card extension: optional "Practice pronunciation" button when `audio` field set

---

## 4. Other parked notes

- **Niveau 3 from earlier discussion** — full SRS engine in Nihongo (FSRS algorithm). Was deferred when user picked Anki bridge instead. Still relevant if Nihongo grows beyond Anki bridge.
- **Promote: batch mode** — promote multiple imports at once into the repo, vs current one-at-a-time
- **Heatmap deeper drill** — click a heatmap cell on `/stats` → see which decks were reviewed that day
- **LLM advice automation** — instead of copy-prompt-paste, an "Ask now" button that calls the Anthropic / OpenAI API directly (requires user-supplied API key in settings)
- **STT pour exercices oraux** — speech-to-text in browser (Whisper via WASM or Web Speech API) for free-input by voice. Separate from §3 (pronunciation) — that's analysis, this is transcription.

---

## How to use this file

When starting a new chat / picking up later:
1. Read this doc first
2. Pick one section
3. Skim the "Files to read first" / "Where it lives" pointers
4. Resume with full context in ~5 min
