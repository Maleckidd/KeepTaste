# IDEAS — scratchpad

Loose ideas for KeepTaste and conclusions from conversations with Claude. This is NOT a spec or backlog — mature items move to SPEC.md (§5.x) / TODO (§8). Writing scrappy here is fine.

---

## Recipe refinement (cooking log)

*Conclusions from a conversation — 2026-06-15*

**Need:** the cook makes the same recipe again and finds an improvement. Today this gets captured in the flat `notes` field.

**Problem with the current `notes`:** one field mixes three things —
1. permanent knowledge about the recipe (should go into the instructions),
2. a dated cooking log (the refinement history),
3. one-off notes (junk).
Over time `notes` bloats and loses readability.

**Directions (lightest first):**
- **A. Cooking log** — new `recipe_entries` table (recipe_id, body, createdAt); a "Tries" section on the recipe screen, append-only, newest on top. Instructions = the canonical recipe, the log = the history. ← *recommendation, smallest real step*
- **B. Tries + promotion into the recipe** — like A, plus an "Apply to recipe" button that folds the improvement in permanently. Closes the loop: experiment → proven → recipe.
- **C. Versioning (instruction snapshots)** — full history + restore. Probably overkill, risk of landing in §7 out-of-scope.

**Small things independent of the variant:**
- rating / "favorite version" on a log entry (star/heart),
- the entry date alone gives "when did I last make this" (the app doesn't know this today).

**Open questions (they change the shape of the feature):**
- should the log round-trip through the MD backup (§5.6/5.8), or is it in-app-only data?
- do we keep `notes` alongside the log, or does the log replace it (possible migration: old `notes` → first entry)?

**Status:** concept, to be refined. Start with variant A.

---

## Cooking mode — further directions

*Conclusions from a conversation — 2026-06-26*

**Shipped already (this is the baseline, not a TODO):**
- **Keep-awake** while a recipe is open (`utils/keepAwake.ts`, always-on) — §6.
- **In-recipe text zoom (A− / A+)** in the recipe header — scales content 1×–1.8×, ephemeral (resets on exit). §5.4. This is the lightweight "reading boost", deliberately *not* a step-by-step screen.

**Key framing:** "cooking mode" splits into two very different things —
- **A. Reading-view polish** — bigger text, screen stays on, ingredient check-off. Small, fits the MVP philosophy, doesn't touch §7. ← *the zoom above is the first piece*
- **B. Step-by-step active screen** — one step at a time, swipe between steps, active-step highlight. This is the thing §7 keeps **out of scope** ("Complexity, beyond MVP"). Entering it = a deliberate reversal of that decision.

**Directions (lightest first):**
- **Ingredient check-off** — tap an ingredient to strike it through while shopping/cooking. Pure UI state, no DB; the parser (`utils/ingredients.ts`) and the shopping-list checkbox pattern already exist. ← *recommendation, biggest value for the effort, and often more useful at the counter than bigger text*
- **Keep-awake as a toggle** instead of always-on — lets normal browsing dim the screen (battery) and makes keep-awake a *signal* of cooking mode rather than a silent default. Inverts current behavior, so it's a UX decision, not just a feature.
- **Step check-off / active-step highlight** — needs the instructions split into discrete steps; today they're one Markdown block. Medium cost.
- **Full step-by-step screen (B)** — high cost; the §7 line.

**Watch out:**
- **Timers** ("cook 10 min" → tappable countdown) are tempting in cooking mode but **§7 lists "Notifications / timers" as out of scope** — pulling them in is another decision to justify, not a freebie.
- Persisting any of this (e.g. a *saved* font preference, per-recipe checked state) means an `app_settings` key or schema change — weigh against the "ephemeral, zero-settings" lean the zoom deliberately took.

**Status:** zoom + keep-awake shipped; ingredient check-off is the recommended next step. B (step-by-step) parked as out-of-scope unless explicitly revisited.

---
