# Rejestr znalezisk — KeepTaste

Generowany z `findings.json` po każdej syntezie. Status zmienia właściciel: `run.sh <config> --finding F-012 fixed "commit"`.
Po `fixed` silnik sam ustawia `verified` (nie wróciło, choć ścieżka była sprawdzana) albo `regressed` (wróciło).

| ID | Status | Priorytet | Rodzaj | Znalezisko | Sesje | Pierwszy raz | Ostatnio | Gdzie | Notatka |
|---|---|---|---|---|---|---|---|---|---|
| F-001 | open | P1 | problem | Pole Składniki zasłonięte przy wpisywaniu nowego przepisu (duża czcionka) | 5 | 20261112-114007 | 20261120-235625 | `components/recipe/RecipeForm.tsx:281`, `components/recipe/RecipeForm.tsx:479` |  |
| F-009 | open | P1 | problem | Aplikacja przestaje odpowiadać (ANR) po zapisaniu przepisu | 2 | 20261112-160835 | 20261114-200122 | `app/cookbook/new.tsx:19` |  |
| F-024 | open | P1 | problem | Chipy minutnika przy pierwszym renderze: czas znika, kreska przecina inne słowa | 1 | 20261114-200122 | 20261114-200122 | `components/timers/timerMarkdownRules.tsx:32`, `components/timers/TimerChip.tsx:90` |  |
| F-002 | open | P2 | problem | Wyszukiwanie po kilku składnikach nic nie zwraca i nie podpowiada, co dalej | 2 | 20261112-114007 | 20261112-185244 | `utils/search.ts:91`, `app/cookbook/[id].tsx:444` |  |
| F-003 | open | P2 | problem | Udostępnianie przepisu schowane w menu ··· | 1 | 20261112-114007 | 20261112-114007 | `app/recipe/[id].tsx:254`, `app/recipe/[id].tsx:268` |  |
| F-011 | open | P2 | problem | Przypisanie do książki: pole w formularzu niezauważone, przeniesienie tylko przez ··· → Edytuj | 4 | 20261112-160835 | 20261120-235625 | `components/recipe/RecipeForm.tsx:349`, `app/recipe/[id].tsx:295`, `app/cookbook/[id].tsx:448` |  |
| F-013 | open | P2 | problem | Klawiatura otwiera się sama w Wszystkie przepisy | 4 | 20261112-160835 | 20261120-235625 | `app/cookbook/[id].tsx:395` |  |
| F-021 | open | P2 | problem | Pole Qty nie pokazuje fokusu | 2 | 20261112-185244 | 20261114-200122 | `components/ui/Input.tsx:17` |  |
| F-036 | open | P2 | problem | Stan „do wypróbowania” nieczytelny w formularzu i w widoku przepisu | 1 | 20261120-235625 | 20261120-235625 | `components/recipe/RecipeForm.tsx:380`, `app/recipe/[id].tsx:339` |  |
| F-004 | open | P3 | problem | W widoku książki nie ma pola wyszukiwania | 2 | 20261112-114007 | 20261120-235625 | `app/cookbook/[id].tsx:385` |  |
| F-005 | open | P3 | problem | Dodawanie wielu produktów naraz: Paste a whole list niezauważone | 3 | 20261112-114007 | 20261120-235625 | `app/shopping/[id].tsx:640`, `components/shopping/PasteListSheet.tsx` |  |
| F-012 | open | P3 | problem | Import z linku: zły adres bez walidacji, 404 komunikowane jako blokada strony | 1 | 20261112-160835 | 20261112-160835 | `utils/recipeImportFetch.ts:37`, `components/recipe/ImportSheet.tsx:255`, `components/recipe/ImportSheet.tsx:463` |  |
| F-014 | open | P3 | problem | Ikona aparatu bez podpisu w formularzu nowej książki | 3 | 20261112-160835 | 20261114-200122 | `components/cookbook/CookbookForm.tsx:194` |  |
| F-019 | open | P3 | problem | Autokapitalizacja zmienia pierwsze litery linii w składnikach | 3 | 20261112-185244 | 20261120-235625 | `components/recipe/RecipeForm.tsx:438` |  |
| F-020 | open | P3 | problem | Droga do zakładki Zakupy z wyszukiwania lub przepisu wymaga kilku cofnięć | 3 | 20261112-185244 | 20261120-235625 | `app/cookbook/[id].tsx:395` |  |
| F-026 | open | P3 | problem | Przykładowa książka Śniadania zaskakuje na świeżej instalacji | 2 | 20261114-200122 | 20261120-235625 | `db/seed.ts`, `utils/seedData.ts` |  |
| F-037 | open | P3 | problem | Chipy minutnika rozbijają zdania (osierocona kropka lub nawias) | 1 | 20261120-235625 | 20261120-235625 | `components/timers/timerMarkdownRules.tsx:31`, `components/timers/TimerChip.tsx:90` |  |
| F-038 | open | P3 | problem | Import otwiera się na „Z linku”, gdy użytkownik ma tekst | 1 | 20261120-235625 | 20261120-235625 | `components/recipe/ImportSheet.tsx:97` |  |
| F-039 | open | P3 | problem | Główny przycisk „+” bez podpisu | 1 | 20261120-235625 | 20261120-235625 | `components/ui/Fab.tsx:95` |  |
| F-040 | open | P3 | problem | Formularz przepisu: dużo pól naraz przy słabym wzroku | 1 | 20261120-235625 | 20261120-235625 | `components/recipe/RecipeForm.tsx:368` |  |
| F-041 | open | P3 | problem | Placeholder pokazuje nagłówek „#”, a użytkownik pisze „##” | 1 | 20261120-235625 | 20261120-235625 | `components/recipe/RecipeForm.tsx:440` |  |
| F-006 | open | — | wish | Co ugotuję z tego, co mam — ranking według brakujących składników | 4 | 20261112-114007 | 20261120-235625 | `utils/search.ts` |  |
| F-007 | open | — | wish | Brakujące składniki na listę zakupów jednym przyciskiem | 3 | 20261112-114007 | 20261120-235625 | `app/recipe/add-to-list.tsx` |  |
| F-008 | open | — | wish | Ostrzeżenie o duplikacie na liście zakupów | 3 | 20261112-114007 | 20261114-200122 | `components/shopping/PasteListSheet.tsx` |  |
| F-015 | open | — | wish | Awaryjny zapis tytułu i linku, gdy import zawiedzie | 1 | 20261112-160835 | 20261112-160835 | `components/recipe/ImportSheet.tsx:241`, `components/recipe/ImportSheet.tsx:255` |  |
| F-016 | open | — | wish | Przycisk Wklej ze schowka w polu URL | 3 | 20261112-160835 | 20261120-235625 | `components/recipe/ImportSheet.tsx` |  |
| F-017 | open | — | wish | Nazwa książki widoczna w widoku przepisu | 2 | 20261112-160835 | 20261120-235625 | `app/recipe/[id].tsx:287` |  |
| F-018 | open | — | wish | Informacja, które strony działają, albo lepsze pobieranie przy blokadzie | 1 | 20261112-160835 | 20261112-160835 | `utils/recipeImportFetch.ts:37` |  |
| F-022 | open | — | wish | Skalowanie przepisu z przeliczeniem gramów (poza zakresem, SPEC §7) | 3 | 20261112-185244 | 20261120-235625 |  |  |
| F-023 | open | — | wish | Podgląd PDF książki przed wysłaniem | 2 | 20261112-185244 | 20261120-235625 | `utils/cookbookPdf.ts` |  |
| F-027 | open | — | wish | Dodaj zapisane przepisy z widoku książki | 2 | 20261114-200122 | 20261120-235625 | `app/cookbook/[id].tsx:448` |  |
| F-028 | open | — | wish | Podgląd przepisu przed zapisem | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-029 | open | — | wish | Wyjaśnienie lub wyłączenie chipów minutnika | 2 | 20261114-200122 | 20261120-235625 | `components/timers/timerMarkdownRules.tsx` |  |
| F-030 | open | — | wish | Większy maksymalny rozmiar tekstu | 2 | 20261114-200122 | 20261120-235625 | `app/recipe/[id].tsx:60` |  |
| F-031 | open | — | wish | Podsumowanie po imporcie | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-032 | open | — | wish | Wysyłanie listy tylko z nowymi pozycjami | 2 | 20261114-200122 | 20261120-235625 | `components/shopping/SendListSheet.tsx`, `app/shopping/[id].tsx:714` |  |
| F-033 | open | — | wish | Łatwiejszy odbiorca / Kopiuj listę | 1 | 20261114-200122 | 20261114-200122 |  |  |
| F-034 | open | — | wish | PDF łatwy do znalezienia z wnętrza książki | 2 | 20261114-200122 | 20261120-235625 | `app/cookbook/[id].tsx:511` |  |
| F-035 | open | — | wish | Zachować wpisany tekst przy zamknięciu aplikacji | 2 | 20261114-200122 | 20261120-235625 |  |  |
| F-042 | open | — | wish | Sekcja lub plakietka „Do wypróbowania” na ekranie głównym | 1 | 20261120-235625 | 20261120-235625 | `app/(tabs)/index.tsx` |  |
| F-043 | open | — | wish | Widoczny znak, że ekran nie gaśnie | 1 | 20261120-235625 | 20261120-235625 | `app/recipe/[id].tsx:104` |  |
| F-044 | open | — | wish | Przy wklejaniu listy pytanie: dodać do tej listy czy założyć nową | 1 | 20261120-235625 | 20261120-235625 | `components/shopping/PasteListSheet.tsx` |  |
| F-045 | open | — | wish | Podpowiedź, że import (tekst, zdjęcie, AI) zastąpi ręczne przepisywanie | 1 | 20261120-235625 | 20261120-235625 | `components/recipe/RecipeForm.tsx:293` |  |
| F-046 | open | — | wish | Przycisk A+ także w formularzu przepisu | 1 | 20261120-235625 | 20261120-235625 |  |  |
| F-047 | open | — | wish | Usuwanie wiodących myślników przy imporcie | 1 | 20261120-235625 | 20261120-235625 |  |  |
| F-010 | verified | P1 | problem | Nowo zapisany przepis Bez książki jest niewidoczny po zapisie | 3 | 20261112-160835 | 20261114-200122 | `app/recipe/new.tsx:94`, `app/recipe/new.tsx:98`, `components/ui/SnackbarProvider.tsx:54`, `app/(tabs)/index.tsx:255` | d4fd23c (#29): a new recipe opens its own view after saving; the snackbar is no longer the only way to it |
| F-025 | verified | P1 | problem | Przełącznik Do wypróbowania schowany na dnie formularza, brak w menu przepisu | 1 | 20261114-200122 | 20261114-200122 | `components/recipe/RecipeForm.tsx:457`, `app/recipe/[id].tsx:266`, `app/cookbook/[id].tsx:412` | c86c460 (#28): the To try switch sits under Cookbook in the form; Mark/Unmark to try in the recipe menu |
