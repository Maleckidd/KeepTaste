// AI-handoff prompt builder + response cleanup for the "Transcribe with AI"
// import mode (SPEC §5.15 T4). Pure module — NO react-native/expo imports.
// The app performs zero network calls and embeds no AI; the user pastes a photo
// into their own AI app using this prompt, then pastes the answer back, which is
// cleaned here and fed to parsePastedRecipe. The prompt lives here (not the i18n
// dictionary) because it is a unit-tested parser contract; localizers must not
// alter it. `lang` is passed in from the UI.

const PROMPT_PL = `Przepisz przepis kulinarny z załączonego zdjęcia (często pismo odręczne, po polsku). Odpowiedz WYŁĄCZNIE czystym tekstem w tym formacie:

Pierwsza linia: tylko tytuł przepisu (bez etykiety).
Następnie linia „Składniki:" i pod nią każdy składnik w osobnej linii.
Następnie linia „Przygotowanie:" i pod nią ponumerowane kroki (1., 2., 3. …), każdy w osobnej linii.
Jeśli na zdjęciu są, dodaj też osobne linie: „Czas przygotowania: N minut", „Czas gotowania: N minut", „Porcje: N".
Notatki lub uwagi z marginesu dopisz na końcu, po krokach.

Zasady: zachowaj oryginalne słownictwo i polskie znaki diakrytyczne. Nie dodawaj żadnego komentarza przed ani po. Nie używaj bloków kodu ani formatowania Markdown (bez \`\`\`, bez **, bez #). Słowa nieczytelne oznacz jako [?].`;

const PROMPT_EN = `Transcribe the cooking recipe from the attached photo (often handwritten). Reply with PLAIN TEXT ONLY in this exact format:

First line: the recipe title only (no label).
Then a line "Ingredients:" followed by one ingredient per line.
Then a line "Instructions:" followed by numbered steps (1., 2., 3. …), one per line.
If shown in the photo, also add separate lines: "Prep time: N minutes", "Cook time: N minutes", "Servings: N".
Put any margin notes or remarks at the end, after the steps.

Rules: keep the original wording and accented characters. Do not add any commentary before or after. Do not use code blocks or Markdown formatting (no \`\`\`, no **, no #). Mark any illegible words as [?].`;

export function buildAiTranscribePrompt(lang: 'en' | 'pl'): string {
  return lang === 'pl' ? PROMPT_PL : PROMPT_EN;
}

const PREAMBLE_PREFIXES = [
  'oto przepis',
  'poniżej',
  'here is',
  "here's",
  'sure',
  'certainly',
  'of course',
];

const isFenceLine = (line: string): boolean => /^```[a-zA-Z]*$/.test(line.trim());
const isClosingFence = (line: string): boolean => line.trim() === '```';
const isSeparatorOnly = (line: string): boolean =>
  /^(-{3,}|\*{3,}|_{3,}|={3,})$/.test(line.trim());

const firstNonBlankIndex = (lines: string[]): number =>
  lines.findIndex((l) => l.trim().length > 0);
const lastNonBlankIndex = (lines: string[]): number => {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) return i;
  }
  return -1;
};

// Conservative cleanup of an AI answer before handing it to parsePastedRecipe.
// Idempotent; never empties non-whitespace input.
export function cleanAiResponse(text: string): string {
  if (!text || !text.trim()) return '';

  // A preamble can wrap OUTSIDE a fence ("Oto przepis:\n```\n…\n```"), so run
  // the passes to a fixed point. Each pass is monotonic (only ever removes
  // structure), which also makes the whole function idempotent.
  let current = text;
  for (let i = 0; i < 4; i++) {
    const next = cleanPass(current);
    if (next === current) break;
    current = next;
  }

  const result = current.trim();
  // Non-empty guarantee.
  if (!result) return text.trim();
  return result;
}

function cleanPass(text: string): string {
  let lines = text.split('\n');

  // 1. Unwrap a single OUTER triple-backtick fence.
  const firstIdx = firstNonBlankIndex(lines);
  const lastIdx = lastNonBlankIndex(lines);
  if (
    firstIdx !== -1 &&
    lastIdx !== -1 &&
    firstIdx !== lastIdx &&
    isFenceLine(lines[firstIdx]) &&
    isClosingFence(lines[lastIdx])
  ) {
    lines = lines.slice(firstIdx + 1, lastIdx);
  }

  // 2. Strip ONE leading assistant-preamble line, only when content follows.
  {
    const fi = firstNonBlankIndex(lines);
    if (fi !== -1) {
      const candidate = lines[fi].trim().toLowerCase();
      const isPreamble = PREAMBLE_PREFIXES.some((p) => candidate.startsWith(p));
      // Only strip if the whole line is essentially the preamble (allowing a
      // trailing ':' / '…'), and there is more non-blank content after it.
      if (isPreamble) {
        const hasMore = lines.slice(fi + 1).some((l) => l.trim().length > 0);
        if (hasMore) {
          lines = [...lines.slice(0, fi), ...lines.slice(fi + 1)];
        }
      }
    }
  }

  // 3. Strip trailing separator-only lines.
  while (lines.length > 0) {
    const li = lastNonBlankIndex(lines);
    if (li !== -1 && isSeparatorOnly(lines[li])) {
      lines = lines.slice(0, li);
    } else {
      break;
    }
  }

  // 4. Per-line markdown strip, keeping content.
  lines = lines.map((line) => {
    let out = line;
    // leading heading marker (#, ##, ### + space)
    out = out.replace(/^(\s*)#{1,3}\s+/, '$1');
    // leading blockquote marker
    out = out.replace(/^(\s*)>\s+/, '$1');
    // wrapping bold/underscore emphasis around the whole (trimmed) line
    const trimmed = out.trim();
    const boldWrap = trimmed.match(/^\*\*([\s\S]+)\*\*$/);
    const underWrap = trimmed.match(/^__([\s\S]+)__$/);
    if (boldWrap) {
      out = out.replace(trimmed, boldWrap[1]);
    } else if (underWrap) {
      out = out.replace(trimmed, underWrap[1]);
    }
    return out;
  });

  // 5. Trim.
  return lines.join('\n').trim();
}
