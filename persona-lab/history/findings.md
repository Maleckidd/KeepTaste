# Rejestr znalezisk — KeepTaste

Generowany z `findings.json` po każdej syntezie. Status zmienia właściciel: `run.sh <config> --finding F-012 fixed "commit"`.
Po `fixed` silnik sam ustawia `verified` (nie wróciło, choć ścieżka była sprawdzana) albo `regressed` (wróciło).

| ID | Status | Priorytet | Rodzaj | Znalezisko | Sesje | Pierwszy raz | Ostatnio | Gdzie | Notatka |
|---|---|---|---|---|---|---|---|---|---|
| F-009 | open | P1 | problem | Aplikacja przestaje odpowiadać (ANR) po zapisaniu przepisu | 2 | 20261112-160835 | 20261114-200122 | `app/cookbook/new.tsx:19` |  |
| F-011 | open | P1 | problem | Przypisanie do książki: pole w formularzu niezauważone, przeniesienie tylko przez ··· → Edytuj | 3 | 20261112-160835 | 20261114-200122 | `app/recipe/[id].tsx:262`, `components/recipe/RecipeForm.tsx:349`, `app/cookbook/[id].tsx:447`, `app/cookbook/[id].tsx:512` |  |
| F-024 | open | P1 | problem | Chipy minutnika przy pierwszym renderze: czas znika, kreska przecina inne słowa | 1 | 20261114-200122 | 20261114-200122 | `components/timers/timerMarkdownRules.tsx:32`, `components/timers/TimerChip.tsx:90` |  |
| F-001 | open | P2 | problem | Pole Składniki zasłonięte przy wpisywaniu nowego przepisu (duża czcionka) | 4 | 20261112-114007 | 20261114-200122 | `components/recipe/RecipeForm.tsx:281`, `components/recipe/RecipeForm.tsx:477` |  |
| F-002 | open | P2 | problem | Wyszukiwanie po kilku składnikach nic nie zwraca i nie podpowiada, co dalej | 2 | 20261112-114007 | 20261112-185244 | `utils/search.ts:91`, `app/cookbook/[id].tsx:444` |  |
| F-003 | open | P2 | problem | Udostępnianie przepisu schowane w menu ··· | 1 | 20261112-114007 | 20261112-114007 | `app/recipe/[id].tsx:254`, `app/recipe/[id].tsx:268` |  |
| F-013 | open | P2 | problem | Klawiatura otwiera się sama w Wszystkie przepisy | 3 | 20261112-160835 | 20261114-200122 | `app/cookbook/[id].tsx:395` |  |
| F-021 | open | P2 | problem | Pole Qty nie pokazuje fokusu | 2 | 20261112-185244 | 20261114-200122 | `components/ui/Input.tsx:17` |  |
| F-004 | open | P3 | problem | W widoku książki nie ma pola wyszukiwania | 1 | 20261112-114007 | 20261112-114007 | `app/cookbook/[id].tsx:381` |  |
| F-005 | open | P3 | problem | Dodawanie wielu produktów naraz: Paste a whole list niezauważone | 2 | 20261112-114007 | 20261112-185244 | `app/shopping/[id].tsx:584`, `app/shopping/[id].tsx:630`, `components/shopping/PasteListSheet.tsx:45` |  |
| F-012 | open | P3 | problem | Import z linku: zły adres bez walidacji, 404 komunikowane jako blokada strony | 1 | 20261112-160835 | 20261112-160835 | `utils/recipeImportFetch.ts:37`, `components/recipe/ImportSheet.tsx:255`, `components/recipe/ImportSheet.tsx:463` |  |
| F-014 | open | P3 | problem | Ikona aparatu bez podpisu w formularzu nowej książki | 3 | 20261112-160835 | 20261114-200122 | `components/cookbook/CookbookForm.tsx:194` |  |
| F-019 | open | P3 | problem | Autokapitalizacja zmienia pierwsze litery linii w składnikach | 2 | 20261112-185244 | 20261114-200122 | `components/recipe/RecipeForm.tsx:418` |  |
| F-020 | open | P3 | problem | Droga do zakładki Zakupy z wyszukiwania lub przepisu wymaga kilku cofnięć | 2 | 20261112-185244 | 20261114-200122 | `app/cookbook/[id].tsx:395` |  |
| F-026 | open | P3 | problem | Przykładowa książka Śniadania zaskakuje na świeżej instalacji | 1 | 20261114-200122 | 20261114-200122 | `db/seed.ts` |  |
| F-006 | open | — | wish | Co ugotuję z tego, co mam — ranking według brakujących składników | 3 | 20261112-114007 | 20261114-200122 | `utils/search.ts:67` |  |
| F-007 | open | — | wish | Brakujące składniki na listę zakupów jednym przyciskiem | 2 | 20261112-114007 | 20261114-200122 | `app/recipe/add-to-list.tsx` |  |
| F-008 | open | — | wish | Ostrzeżenie o duplikacie na liście zakupów | 3 | 20261112-114007 | 20261114-200122 | `components/shopping/PasteListSheet.tsx` |  |
| F-015 | open | — | wish | Awaryjny zapis tytułu i linku, gdy import zawiedzie | 1 | 20261112-160835 | 20261112-160835 | `components/recipe/ImportSheet.tsx:241`, `components/recipe/ImportSheet.tsx:255` |  |
| F-016 | open | — | wish | Przycisk Wklej ze schowka w polu URL | 2 | 20261112-160835 | 20261114-200122 | `components/recipe/ImportSheet.tsx:463`, `components/shopping/PasteListSheet.tsx:45` |  |
| F-017 | open | — | wish | Nazwa książki widoczna w widoku przepisu | 1 | 20261112-160835 | 20261112-160835 | `app/recipe/[id].tsx:287` |  |
| F-018 | open | — | wish | Informacja, które strony działają, albo lepsze pobieranie przy blokadzie | 1 | 20261112-160835 | 20261112-160835 | `utils/recipeImportFetch.ts:37` |  |
| F-022 | open | — | wish | Skalowanie przepisu z przeliczeniem gramów (poza zakresem, SPEC §7) | 2 | 20261112-185244 | 20261114-200122 |  |  |
| F-023 | open | — | wish | Podgląd PDF książki przed wysłaniem | 1 | 20261112-185244 | 20261112-185244 | `app/cookbook/[id].tsx:307`, `utils/cookbookPdf.ts` |  |
| F-027 | open | — | wish | Dodaj zapisane przepisy z widoku książki | 1 | 20261114-200122 | 20261114-200122 | `app/cookbook/[id].tsx:447` |  |
| F-028 | open | — | wish | Podgląd przepisu przed zapisem | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-029 | open | — | wish | Wyjaśnienie lub wyłączenie chipów minutnika | 1 | 20261114-200122 | 20261114-200122 | `components/timers/TimerChip.tsx` |  |
| F-030 | open | — | wish | Większy maksymalny rozmiar tekstu | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-031 | open | — | wish | Podsumowanie po imporcie | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-032 | open | — | wish | Wysyłanie listy tylko z nowymi pozycjami | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-033 | open | — | wish | Łatwiejszy odbiorca / Kopiuj listę | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-034 | open | — | wish | PDF łatwy do znalezienia z wnętrza książki | 1 | 20261114-200122 | 20261114-200122 | `app/cookbook/[id].tsx:512` |  |
| F-035 | open | — | wish | Zachować wpisany tekst przy zamknięciu aplikacji | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-010 | fixed | P1 | problem | Nowo zapisany przepis Bez książki jest niewidoczny po zapisie | 3 | 20261112-160835 | 20261114-200122 | `app/recipe/new.tsx:94`, `app/recipe/new.tsx:98`, `components/ui/SnackbarProvider.tsx:54`, `app/(tabs)/index.tsx:255` | d4fd23c (#29): a new recipe opens its own view after saving; the snackbar is no longer the only way to it |
| F-025 | fixed | P1 | problem | Przełącznik Do wypróbowania schowany na dnie formularza, brak w menu przepisu | 1 | 20261114-200122 | 20261114-200122 | `components/recipe/RecipeForm.tsx:457`, `app/recipe/[id].tsx:266`, `app/cookbook/[id].tsx:412` | c86c460 (#28): the To try switch sits under Cookbook in the form; Mark/Unmark to try in the recipe menu |
