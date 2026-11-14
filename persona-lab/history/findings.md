# Rejestr znalezisk — KeepTaste

Generowany z `findings.json` po każdej syntezie. Status zmienia właściciel: `run.sh <config> --finding F-012 fixed "commit"`.
Po `fixed` silnik sam ustawia `verified` (nie wróciło, choć ścieżka była sprawdzana) albo `regressed` (wróciło).

| ID | Status | Priorytet | Rodzaj | Znalezisko | Sesje | Pierwszy raz | Ostatnio | Gdzie | Notatka |
|---|---|---|---|---|---|---|---|---|---|
| F-009 | open | P1 | problem | Aplikacja przestaje odpowiadać (ANR) po zapisaniu przepisu | 1 | 20261112-160835 | 20261112-160835 | `app/recipe/new.tsx:94`, `app/(tabs)/index.tsx:255` |  |
| F-001 | open | P2 | problem | Pole Składniki zasłonięte przy wpisywaniu nowego przepisu (duża czcionka) | 3 | 20261112-114007 | 20261112-185244 | `components/recipe/RecipeForm.tsx:281`, `components/recipe/RecipeForm.tsx:478` |  |
| F-002 | open | P2 | problem | Wyszukiwanie po kilku składnikach nic nie zwraca i nie podpowiada, co dalej | 2 | 20261112-114007 | 20261112-185244 | `utils/search.ts:91`, `app/cookbook/[id].tsx:444` |  |
| F-003 | open | P2 | problem | Udostępnianie przepisu schowane w menu ··· | 1 | 20261112-114007 | 20261112-114007 | `app/recipe/[id].tsx:254`, `app/recipe/[id].tsx:268` |  |
| F-010 | open | P2 | problem | Nowo zapisany przepis Bez książki jest niewidoczny po zapisie | 2 | 20261112-160835 | 20261112-185244 | `app/recipe/new.tsx:94`, `app/recipe/new.tsx:99`, `components/ui/SnackbarProvider.tsx:54` |  |
| F-011 | open | P2 | problem | Przypisanie do książki: pole w formularzu niezauważone, przeniesienie tylko przez ··· → Edytuj | 2 | 20261112-160835 | 20261112-185244 | `app/cookbook/[id].tsx:321`, `app/cookbook/[id].tsx:512`, `app/recipe/[id].tsx:253` |  |
| F-013 | open | P2 | problem | Klawiatura otwiera się sama w Wszystkie przepisy | 2 | 20261112-160835 | 20261112-185244 | `app/cookbook/[id].tsx:395`, `app/(tabs)/index.tsx:187` |  |
| F-004 | open | P3 | problem | W widoku książki nie ma pola wyszukiwania | 1 | 20261112-114007 | 20261112-114007 | `app/cookbook/[id].tsx:381` |  |
| F-005 | open | P3 | problem | Dodawanie wielu produktów naraz: Paste a whole list niezauważone | 2 | 20261112-114007 | 20261112-185244 | `app/shopping/[id].tsx:584`, `app/shopping/[id].tsx:630`, `components/shopping/PasteListSheet.tsx:45` |  |
| F-012 | open | P3 | problem | Import z linku: zły adres bez walidacji, 404 komunikowane jako blokada strony | 1 | 20261112-160835 | 20261112-160835 | `utils/recipeImportFetch.ts:37`, `components/recipe/ImportSheet.tsx:255`, `components/recipe/ImportSheet.tsx:463` |  |
| F-014 | open | P3 | problem | Ikona aparatu bez podpisu w formularzu nowej książki | 2 | 20261112-160835 | 20261112-185244 | `components/cookbook/CookbookForm.tsx:194` |  |
| F-019 | open | P3 | problem | Autokapitalizacja zmienia pierwsze litery linii w składnikach | 1 | 20261112-185244 | 20261112-185244 | `components/recipe/RecipeForm.tsx:418` |  |
| F-020 | open | P3 | problem | Droga do zakładki Zakupy z wyszukiwania lub przepisu wymaga kilku cofnięć | 1 | 20261112-185244 | 20261112-185244 | `app/cookbook/[id].tsx:395`, `app/recipe/[id].tsx` |  |
| F-021 | open | P3 | problem | Pole Qty nie pokazuje fokusu | 1 | 20261112-185244 | 20261112-185244 | `components/ui/Input.tsx:26`, `app/shopping/[id].tsx:606` |  |
| F-006 | open | — | wish | Co ugotuję z tego, co mam — ranking według brakujących składników | 2 | 20261112-114007 | 20261112-185244 | `utils/search.ts:67` |  |
| F-007 | open | — | wish | Brakujące składniki na listę zakupów jednym przyciskiem | 1 | 20261112-114007 | 20261112-114007 | `app/recipe/add-to-list.tsx` |  |
| F-008 | open | — | wish | Ostrzeżenie o duplikacie na liście zakupów | 2 | 20261112-114007 | 20261112-185244 | `app/recipe/add-to-list.tsx` |  |
| F-015 | open | — | wish | Awaryjny zapis tytułu i linku, gdy import zawiedzie | 1 | 20261112-160835 | 20261112-160835 | `components/recipe/ImportSheet.tsx:241`, `components/recipe/ImportSheet.tsx:255` |  |
| F-016 | open | — | wish | Przycisk Wklej ze schowka w polu URL | 1 | 20261112-160835 | 20261112-160835 | `components/recipe/ImportSheet.tsx:463` |  |
| F-017 | open | — | wish | Nazwa książki widoczna w widoku przepisu | 1 | 20261112-160835 | 20261112-160835 | `app/recipe/[id].tsx:287` |  |
| F-018 | open | — | wish | Informacja, które strony działają, albo lepsze pobieranie przy blokadzie | 1 | 20261112-160835 | 20261112-160835 | `utils/recipeImportFetch.ts:37` |  |
| F-022 | open | — | wish | Skalowanie przepisu z przeliczeniem gramów (poza zakresem, SPEC §7) | 1 | 20261112-185244 | 20261112-185244 |  |  |
| F-023 | open | — | wish | Podgląd PDF książki przed wysłaniem | 1 | 20261112-185244 | 20261112-185244 | `app/cookbook/[id].tsx:307`, `utils/cookbookPdf.ts` |  |
