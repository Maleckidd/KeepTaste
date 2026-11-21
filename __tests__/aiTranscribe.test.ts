// Tests for the "Transcribe with AI" import mode (SPEC §5.15 T4).
import { buildAiTranscribePrompt, cleanAiResponse } from '@/utils/aiTranscribe';
import { parsePastedRecipe } from '@/utils/recipeImport';

describe('buildAiTranscribePrompt', () => {
  describe("lang 'pl'", () => {
    const prompt = () => buildAiTranscribePrompt('pl');

    it('is non-empty', () => {
      expect(prompt().trim().length).toBeGreaterThan(0);
    });

    it('contains the Polish field labels', () => {
      const p = prompt();
      expect(p).toContain('Składniki:');
      expect(p).toContain('Przygotowanie:');
      expect(p).toContain('Porcje:');
      expect(p).toContain('Czas przygotowania');
      expect(p).toContain('Czas gotowania');
    });

    it('contains the [?] unknown-value token', () => {
      expect(prompt()).toContain('[?]');
    });

    it('does NOT contain English labels', () => {
      const p = prompt();
      expect(p).not.toContain('Ingredients:');
      expect(p).not.toContain('Instructions:');
    });

    it('instructs against code fences / markdown (behavioral, loose)', () => {
      const p = prompt();
      expect(p.includes('```') || /markdown/i.test(p)).toBe(true);
    });

    it('mentions no-commentary and title-first-line rules (loose)', () => {
      const p = prompt().toLowerCase();
      // first line is the title only
      expect(p).toContain('tytu');
      // keep diacritics
      expect(p).toContain('diakryt');
    });
  });

  describe("lang 'en'", () => {
    const prompt = () => buildAiTranscribePrompt('en');

    it('is non-empty', () => {
      expect(prompt().trim().length).toBeGreaterThan(0);
    });

    it('contains the English field labels', () => {
      const p = prompt();
      expect(p).toContain('Ingredients:');
      expect(p).toContain('Instructions:');
      expect(p).toContain('Servings:');
      expect(p).toContain('Prep time');
      expect(p).toContain('Cook time');
    });

    it('contains the [?] unknown-value token', () => {
      expect(prompt()).toContain('[?]');
    });

    it('does NOT contain Polish labels', () => {
      const p = prompt();
      expect(p).not.toContain('Składniki:');
      expect(p).not.toContain('Przygotowanie:');
    });

    it('instructs against code fences / markdown (behavioral, loose)', () => {
      const p = prompt();
      expect(p.includes('```') || /markdown/i.test(p)).toBe(true);
    });

    it('mentions no-commentary and title-first-line rules (loose)', () => {
      const p = prompt().toLowerCase();
      expect(p).toContain('title');
      // first line only / no extra commentary
      expect(p).toContain('first line');
    });
  });
});

describe('cleanAiResponse', () => {
  it('unwraps a single bare triple-backtick fence', () => {
    const input = '```\nTytuł\nSkładniki:\n- mąka\n```';
    expect(cleanAiResponse(input)).toBe('Tytuł\nSkładniki:\n- mąka');
  });

  it('unwraps a tagged fence (```markdown)', () => {
    const input = '```markdown\nTytuł\nSkładniki:\n- mąka\n```';
    expect(cleanAiResponse(input)).toBe('Tytuł\nSkładniki:\n- mąka');
  });

  it('unwraps a tagged fence (```text)', () => {
    const input = '```text\nHello\nWorld\n```';
    expect(cleanAiResponse(input)).toBe('Hello\nWorld');
  });

  it('leaves interior backticks that do not form a full wrap untouched', () => {
    const input = 'Line one with ``` inside\nLine two';
    // Not a valid full wrap (no closing fence on its own line) → left alone,
    // aside from trimming.
    expect(cleanAiResponse(input)).toBe('Line one with ``` inside\nLine two');
  });

  it('strips a Polish preamble line when content follows', () => {
    const input = 'Oto przepis:\nTytuł\nSkładniki:\n- mąka';
    expect(cleanAiResponse(input)).toBe('Tytuł\nSkładniki:\n- mąka');
  });

  it('strips an English preamble line when content follows', () => {
    const input = "Here's the recipe:\nTitle\nIngredients:\n- flour";
    expect(cleanAiResponse(input)).toBe('Title\nIngredients:\n- flour');
  });

  it('keeps the preamble-looking line when it is the only non-blank line', () => {
    const input = 'Here is the recipe';
    expect(cleanAiResponse(input)).toBe('Here is the recipe');
  });

  it('strips trailing separator-only lines (---)', () => {
    const input = 'Tytuł\nSkładniki:\n- mąka\n---';
    expect(cleanAiResponse(input)).toBe('Tytuł\nSkładniki:\n- mąka');
  });

  it('strips wrapping bold markdown per line (**Tytuł** -> Tytuł)', () => {
    expect(cleanAiResponse('**Tytuł**')).toBe('Tytuł');
  });

  it('strips a leading heading marker (# Heading -> Heading)', () => {
    expect(cleanAiResponse('# Heading\nBody')).toBe('Heading\nBody');
  });

  it('strips a leading blockquote marker (> quoted -> quoted)', () => {
    expect(cleanAiResponse('> quoted line')).toBe('quoted line');
  });

  it('is a no-op on already-clean multi-line recipe text', () => {
    const clean = 'Naleśniki\nSkładniki:\n- mąka\n- mleko\nPrzygotowanie:\n1. Wymieszaj.';
    expect(cleanAiResponse(clean)).toBe(clean);
  });

  it('is idempotent (cleaning twice equals cleaning once)', () => {
    const input = 'Oto przepis:\n```markdown\n# **Tytuł**\nSkładniki:\n- mąka\n---\n```';
    const once = cleanAiResponse(input);
    expect(cleanAiResponse(once)).toBe(once);
  });

  it('never yields empty output for non-whitespace input (non-empty guarantee)', () => {
    // "**x**" would strip to "x"; but even a pathological strip must not empty out.
    expect(cleanAiResponse('**x**')).toBe('x');
    expect(cleanAiResponse('**x**').length).toBeGreaterThan(0);
  });

  it("returns '' for whitespace-only input", () => {
    expect(cleanAiResponse('   ')).toBe('');
    expect(cleanAiResponse('')).toBe('');
  });
});

describe('cleanAiResponse + parsePastedRecipe round-trip', () => {
  it('cleans a realistic Polish AI answer and parses it correctly', () => {
    const answer = [
      'Oto przepis:',
      '```markdown',
      'Naleśniki babuni',
      'Składniki:',
      '- 2 szklanki mąki',
      '- 2 jajka',
      '- 500 ml mleka',
      'Przygotowanie:',
      '1. Wymieszaj mąkę z jajkami.',
      '2. Dodaj mleko i smaż na patelni.',
      'Porcje: 4',
      '```',
    ].join('\n');

    const parsed = parsePastedRecipe(cleanAiResponse(answer));

    expect(parsed.title).toBe('Naleśniki babuni');
    expect(parsed.servings).toBe(4);
    expect(parsed.ingredients).toContain('2 jajka');
    expect(parsed.instructions).toContain('Wymieszaj mąkę z jajkami.');
    // ingredients and instructions must not bleed into each other.
    expect(parsed.ingredients).not.toContain('Wymieszaj mąkę z jajkami.');
    expect(parsed.instructions).not.toContain('2 jajka');
  });
});

// Gaps found by mutation testing (docs/mutation-testing.md).
describe('cleanAiResponse — fences', () => {
  it('unwraps indented fences and ignores blank lines around them', () => {
    expect(cleanAiResponse('  \n  ```\nTytuł\n  ```\n  \n')).toBe('Tytuł');
  });

  it('does not unwrap when the first line has text after the fence tag', () => {
    const input = '```js and more\nbody\n```';
    expect(cleanAiResponse(input)).toBe(input);
  });

  it('does not unwrap when the first line has text before the fence', () => {
    const input = 'note```\nbody\n```';
    expect(cleanAiResponse(input)).toBe(input);
  });

  it('does not unwrap without a closing fence on the last line', () => {
    const input = '```\nbody\nend';
    expect(cleanAiResponse(input)).toBe(input);
  });

  it('falls back to the trimmed input when cleaning would leave nothing', () => {
    expect(cleanAiResponse('  ```\n```  \n')).toBe('```\n```');
  });
});

describe('cleanAiResponse — preamble', () => {
  it('matches the preamble prefix after trimming and lowercasing', () => {
    expect(cleanAiResponse('  HERE IS the recipe:\nTitle')).toBe('Title');
  });

  it('strips a preamble that follows blank lines', () => {
    expect(cleanAiResponse('\nHere is the recipe:\nTitle')).toBe('Title');
  });

  it('strips the preamble when blank lines separate it from the content', () => {
    expect(cleanAiResponse('Here is the recipe:\n\nTitle')).toBe('Title');
  });
});

describe('cleanAiResponse — trailing separators', () => {
  it.each(['***', '___', '===', '  ---  '])('strips a trailing %p line', (sep) => {
    expect(cleanAiResponse(`Title\n${sep}`)).toBe('Title');
  });

  it('strips several trailing separator lines', () => {
    expect(cleanAiResponse('Title\n---\n\n***')).toBe('Title');
  });

  it('keeps a line that only starts or ends with a separator', () => {
    expect(cleanAiResponse('Title\n--- end')).toBe('Title\n--- end');
    expect(cleanAiResponse('Title\nServe ---')).toBe('Title\nServe ---');
  });

  it('keeps a separator-only input rather than emptying it', () => {
    expect(cleanAiResponse('\n---')).toBe('---');
  });
});

describe('cleanAiResponse — per-line markdown', () => {
  it('strips heading markers of every level, keeping indentation', () => {
    expect(cleanAiResponse('Title\n## Składniki\n  # Krok\n#   Uwagi')).toBe(
      'Title\nSkładniki\n  Krok\nUwagi'
    );
  });

  it('leaves a "#" in the middle of a line alone', () => {
    expect(cleanAiResponse('Title\nMix # well')).toBe('Title\nMix # well');
  });

  it('strips blockquote markers, keeping indentation', () => {
    expect(cleanAiResponse('Title\n  > quoted\n>   wide')).toBe(
      'Title\n  quoted\nwide'
    );
  });

  it('leaves a ">" in the middle of a line alone', () => {
    expect(cleanAiResponse('Title\nheat > 180')).toBe('Title\nheat > 180');
  });

  it('unwraps bold around a whole (padded) line of several words', () => {
    expect(cleanAiResponse('Title\n  **Dwa słowa**  \nx')).toBe(
      'Title\n  Dwa słowa  \nx'
    );
  });

  it('leaves bold that does not wrap the whole line', () => {
    expect(cleanAiResponse('Title\n**Uwaga** sól\nDodaj **sól**')).toBe(
      'Title\n**Uwaga** sól\nDodaj **sól**'
    );
  });

  it('unwraps underscore emphasis around a whole line', () => {
    expect(cleanAiResponse('Title\n__Dwa słowa__')).toBe('Title\nDwa słowa');
  });

  it('leaves underscore emphasis that does not wrap the whole line', () => {
    expect(cleanAiResponse('Title\n__a__ b\nc __d__')).toBe(
      'Title\n__a__ b\nc __d__'
    );
  });
});

describe('cleanAiResponse — fence line padding', () => {
  it('unwraps a fence whose opening line has trailing spaces', () => {
    expect(cleanAiResponse('```  \nTytuł\n```')).toBe('Tytuł');
  });
});
