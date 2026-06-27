// Central UI string dictionary for KeepTaste (SPEC.md §5.11).
// Every user-facing string in app/ and components/ lives here with an English
// and a Polish translation. Never hardcode user-facing strings in components.
//
// Dynamic values use {token} placeholders, substituted via utils/i18n
// interpolate(). Polish plurals are handled with pluralPl() + the
// *.one / *.few / *.many key triplets.
//
// The Markdown export/import format stays English-only and is NOT translated
// here (see utils/markdown.ts and utils/importMarkdown.ts).

export type Language = 'en' | 'pl';

export const dictionary = {
  // --- Common / shared ---
  'common.cancel': { en: 'Cancel', pl: 'Anuluj' },
  'common.save': { en: 'Save', pl: 'Zapisz' },
  'common.delete': { en: 'Delete', pl: 'Usuń' },
  'common.edit': { en: 'Edit', pl: 'Edytuj' },
  'common.discardTitle': { en: 'Discard changes?', pl: 'Odrzucić zmiany?' },
  'common.discardMessage': {
    en: 'Your changes will not be saved.',
    pl: 'Twoje zmiany nie zostaną zapisane.',
  },
  'common.keepEditing': { en: 'Keep editing', pl: 'Kontynuuj edycję' },
  'common.discard': { en: 'Discard', pl: 'Odrzuć' },
  'common.gallery': { en: 'Gallery', pl: 'Galeria' },
  'common.camera': { en: 'Camera', pl: 'Aparat' },
  'common.removePhoto': { en: 'Remove photo', pl: 'Usuń zdjęcie' },
  'common.permissionRequired': {
    en: 'Permission required',
    pl: 'Wymagane uprawnienie',
  },
  'common.permissionPhotos': {
    en: 'The app needs access to your photos.',
    pl: 'Aplikacja potrzebuje dostępu do Twoich zdjęć.',
  },
  'common.permissionCamera': {
    en: 'The app needs access to the camera.',
    pl: 'Aplikacja potrzebuje dostępu do aparatu.',
  },

  // --- Undo snackbar ---
  'undo.deleted': { en: 'Deleted "{name}"', pl: 'Usunięto „{name}”' },
  'undo.action': { en: 'Undo', pl: 'Cofnij' },

  // --- Accessibility labels (icon-only controls) ---
  'a11y.moreActions': { en: 'More options', pl: 'Więcej opcji' },
  'a11y.back': { en: 'Go back', pl: 'Wstecz' },
  'a11y.close': { en: 'Close', pl: 'Zamknij' },
  'a11y.settings': { en: 'Settings', pl: 'Ustawienia' },
  'a11y.addCookbook': { en: 'Add cookbook', pl: 'Dodaj książkę kucharską' },
  'a11y.addRecipe': { en: 'Add recipe', pl: 'Dodaj przepis' },
  'a11y.addList': { en: 'New shopping list', pl: 'Nowa lista zakupów' },
  'a11y.addProduct': { en: 'Add product', pl: 'Dodaj produkt' },
  'a11y.shareRecipe': { en: 'Share recipe', pl: 'Udostępnij przepis' },
  'a11y.increaseFont': { en: 'Increase text size', pl: 'Zwiększ rozmiar tekstu' },
  'a11y.decreaseFont': { en: 'Decrease text size', pl: 'Zmniejsz rozmiar tekstu' },
  'a11y.shareCookbook': { en: 'Share cookbook', pl: 'Udostępnij książkę' },
  'a11y.confirmProduct': { en: 'Confirm product', pl: 'Zatwierdź produkt' },
  'a11y.checkAllInGroup': {
    en: 'Add all {count} {name} to cart',
    pl: 'Dodaj wszystkie {count} {name} do koszyka',
  },
  'a11y.recipePhoto': { en: 'Recipe photo', pl: 'Zdjęcie przepisu' },
  'a11y.changePhoto': { en: 'Add or change photo', pl: 'Dodaj lub zmień zdjęcie' },
  'a11y.import': { en: 'Import recipe', pl: 'Importuj przepis' },

  // --- Tabs ---
  'tabs.recipes': { en: 'Recipes', pl: 'Przepisy' },
  'tabs.shopping': { en: 'Shopping', pl: 'Zakupy' },

  // --- Stack screen titles (app/_layout.tsx) ---
  'stack.cookbook': { en: 'Cookbook', pl: 'Książka kucharska' },
  'stack.recipe': { en: 'Recipe', pl: 'Przepis' },
  'stack.newRecipe': { en: 'New recipe', pl: 'Nowy przepis' },
  'stack.editRecipe': { en: 'Edit recipe', pl: 'Edytuj przepis' },
  'stack.shoppingList': { en: 'Shopping list', pl: 'Lista zakupów' },
  'stack.newShoppingList': {
    en: 'New shopping list',
    pl: 'Nowa lista zakupów',
  },
  'stack.addToList': {
    en: 'Add to shopping list',
    pl: 'Dodaj do listy zakupów',
  },
  'stack.newCookbook': { en: 'New cookbook', pl: 'Nowa książka kucharska' },
  'stack.editCookbook': {
    en: 'Edit cookbook',
    pl: 'Edytuj książkę kucharską',
  },

  // --- Home / cookbooks list (app/(tabs)/index.tsx) ---
  // The home header carries the brand; the "Recipes" tab label below already
  // names the screen's function. App name stays untranslated.
  'home.title': { en: 'KeepTaste', pl: 'KeepTaste' },
  'home.allRecipes': { en: 'All recipes', pl: 'Wszystkie przepisy' },
  'home.emptyTitle': { en: 'No cookbooks', pl: 'Brak książek kucharskich' },
  'home.emptyText': {
    en: 'Create your first cookbook and start collecting recipes',
    pl: 'Stwórz pierwszą książkę kucharską i zacznij zbierać przepisy',
  },
  'home.emptyAction': {
    en: 'Create a cookbook',
    pl: 'Stwórz książkę kucharską',
  },

  // --- Cookbook / recipes grid (app/cookbook/[id].tsx) ---
  'cookbook.searchPlaceholder': {
    en: 'Search recipes...',
    pl: 'Szukaj przepisów...',
  },
  'cookbook.noResults': { en: 'No results', pl: 'Brak wyników' },
  'cookbook.emptyRecipes': {
    en: 'No recipes here yet — add your first one.',
    pl: 'Nie ma tu jeszcze przepisów — dodaj pierwszy.',
  },
  'cookbook.emptyAction': { en: 'Add recipe', pl: 'Dodaj przepis' },
  'cookbook.exportFailedTitle': { en: 'Export failed', pl: 'Eksport nieudany' },
  'cookbook.exportFailedMessage': {
    en: 'Could not export the cookbook.',
    pl: 'Nie udało się wyeksportować książki kucharskiej.',
  },
  'cookbook.sharePdfTitle': {
    en: 'Share cookbook (PDF)',
    pl: 'Udostępnij książkę (PDF)',
  },
  'cookbook.minutes': { en: '{count} min', pl: '{count} min' },
  'cookbook.servings': { en: '{count} servings', pl: '{count} porcji' },

  // --- Recipe view (app/recipe/[id].tsx) ---
  'recipe.prep': { en: 'Prep', pl: 'Przygotowanie' },
  'recipe.cook': { en: 'Cook', pl: 'Gotowanie' },
  'recipe.total': { en: 'Total', pl: 'Razem' },
  'recipe.servingsLabel': { en: 'Servings', pl: 'Porcje' },
  'recipe.ingredients': { en: 'Ingredients', pl: 'Składniki' },
  'recipe.instructions': { en: 'Instructions', pl: 'Przygotowanie' },
  'recipe.notes': { en: 'Notes', pl: 'Notatki' },
  'recipe.minutesShort': { en: '{count} min', pl: '{count} min' },
  'recipe.hours': { en: '{hours}h', pl: '{hours}h' },
  'recipe.hoursMinutes': { en: '{hours}h {minutes}m', pl: '{hours}h {minutes}m' },

  'recipe.addToList': {
    en: 'Add to shopping list',
    pl: 'Dodaj do listy zakupów',
  },
  'recipe.shareDialogTitle': {
    en: 'Share recipe',
    pl: 'Udostępnij przepis',
  },

  // --- Add ingredients to a shopping list (app/recipe/add-to-list.tsx, §5.12) ---
  'addToList.title': {
    en: 'Add to shopping list',
    pl: 'Dodaj do listy zakupów',
  },
  'addToList.products': { en: 'Products', pl: 'Produkty' },
  'addToList.selectAll': { en: 'Select all', pl: 'Zaznacz wszystkie' },
  'addToList.selectNone': { en: 'Select none', pl: 'Odznacz wszystkie' },
  'addToList.targetList': { en: 'Target list', pl: 'Lista docelowa' },
  'addToList.newList': { en: 'New list', pl: 'Nowa lista' },
  'addToList.addDisabled': { en: 'Select products', pl: 'Zaznacz produkty' },
  'addToList.add.one': {
    en: 'Add {count} product',
    pl: 'Dodaj {count} produkt',
  },
  'addToList.add.few': {
    en: 'Add {count} products',
    pl: 'Dodaj {count} produkty',
  },
  'addToList.add.many': {
    en: 'Add {count} products',
    pl: 'Dodaj {count} produktów',
  },
  'addToList.added.one': {
    en: 'Added {count} product to "{name}".',
    pl: 'Dodano {count} produkt do „{name}”.',
  },
  'addToList.added.few': {
    en: 'Added {count} products to "{name}".',
    pl: 'Dodano {count} produkty do „{name}”.',
  },
  'addToList.added.many': {
    en: 'Added {count} products to "{name}".',
    pl: 'Dodano {count} produktów do „{name}”.',
  },
  'addToList.viewList': { en: 'View list', pl: 'Zobacz listę' },

  // --- Recipe form (components/recipe/RecipeForm.tsx) ---
  'recipeForm.photoTitle': { en: 'Photo', pl: 'Zdjęcie' },
  'recipeForm.missingTitleMessage': {
    en: 'Please enter a recipe title.',
    pl: 'Wpisz tytuł przepisu.',
  },
  'recipeForm.title': { en: 'Recipe title', pl: 'Tytuł przepisu' },
  'recipeForm.titlePlaceholder': {
    en: 'e.g. Strawberry tart...',
    pl: 'np. Tarta truskawkowa...',
  },
  'recipeForm.prep': { en: 'Prep (min)', pl: 'Przygot. (min)' },
  'recipeForm.cook': { en: 'Cook (min)', pl: 'Gotow. (min)' },
  'recipeForm.servings': { en: 'Servings', pl: 'Porcje' },
  'recipeForm.ingredients': { en: 'Ingredients', pl: 'Składniki' },
  'recipeForm.formatHelpLink': {
    en: 'See formatting tips',
    pl: 'Zobacz wskazówki formatowania',
  },
  'recipeForm.ingredientsPlaceholder': {
    en: '200g flour\n100g butter\n- 3 eggs\n\n#Cream\n300ml heavy cream',
    pl: '200g mąki\n100g masła\n- 3 jajka\n\n#Krem\n300ml śmietanki kremówki',
  },
  'recipeForm.instructions': { en: 'Instructions', pl: 'Przygotowanie' },
  'recipeForm.instructionsPlaceholder': {
    en: '# Prepare the dough\nMix the flour with the butter...\n\n# Baking\n**Bake for 45 minutes** at 180°C.',
    pl: '# Przygotuj ciasto\nWymieszaj mąkę z masłem...\n\n# Pieczenie\n**Piecz przez 45 minut** w 180°C.',
  },
  'recipeForm.notes': { en: 'Private notes', pl: 'Prywatne notatki' },
  'recipeForm.notesHint': {
    en: 'Your remarks, tweaks, what to change next time...',
    pl: 'Twoje uwagi, poprawki, co zmienić następnym razem...',
  },
  'recipeForm.notesPlaceholder': {
    en: 'Next time add more vanilla sugar...',
    pl: 'Następnym razem dodać więcej cukru waniliowego...',
  },
  'recipeForm.importAction': {
    en: 'Import from a link or text',
    pl: 'Importuj z linku lub tekstu',
  },

  // --- Single-recipe import sheet (components/recipe/ImportSheet.tsx) ---
  'import.title': { en: 'Import recipe', pl: 'Importuj przepis' },
  'import.modeLink': { en: 'From link', pl: 'Z linku' },
  'import.modePaste': { en: 'Paste text', pl: 'Wklej tekst' },
  'import.urlPlaceholder': {
    en: 'Paste a recipe URL',
    pl: 'Wklej adres URL przepisu',
  },
  'import.pastePlaceholder': {
    en: 'Paste the recipe text',
    pl: 'Wklej tekst przepisu',
  },
  'import.fetchButton': { en: 'Import', pl: 'Importuj' },
  'import.noStructuredData': {
    en: "Couldn't read this page automatically — paste the recipe text instead.",
    pl: 'Nie udało się odczytać tej strony automatycznie — wklej tekst przepisu.',
  },
  'import.networkError': {
    en: "Couldn't load that page. Check the link and your connection.",
    pl: 'Nie udało się wczytać strony. Sprawdź link i połączenie.',
  },
  'import.blocked': {
    en: 'This site blocks automatic import — paste the recipe text instead.',
    pl: 'Ta strona blokuje automatyczny import — wklej tekst przepisu.',
  },
  'import.sourcePrefix': { en: 'Source: {url}', pl: 'Źródło: {url}' },

  // --- Formatting help sheet (components/ui/FormattingHelpSheet.tsx) ---
  'formattingHelp.title': { en: 'Formatting tips', pl: 'Wskazówki formatowania' },
  'formattingHelp.intro': {
    en: 'Type these symbols and your text turns into nicely styled sections, headings and lists.',
    pl: 'Wpisz te znaki, a tekst zamieni się w ładne sekcje, nagłówki i listy.',
  },
  'formattingHelp.colInput': { en: 'You type', pl: 'Wpiszesz' },
  'formattingHelp.colResult': { en: 'You see', pl: 'Zobaczysz' },
  'formattingHelp.headingInput': { en: '# Cream', pl: '# Krem' },
  'formattingHelp.headingResult': { en: 'Cream', pl: 'Krem' },
  'formattingHelp.headingDesc': {
    en: 'A bigger, bold section title',
    pl: 'Większy, pogrubiony tytuł sekcji',
  },
  'formattingHelp.boldInput': { en: '**butter**', pl: '**masło**' },
  'formattingHelp.boldResult': { en: 'butter', pl: 'masło' },
  'formattingHelp.boldDesc': { en: 'Bold text', pl: 'Pogrubiony tekst' },
  'formattingHelp.bulletInput': { en: '- 3 eggs', pl: '- 3 jajka' },
  'formattingHelp.bulletResult': { en: '3 eggs', pl: '3 jajka' },
  'formattingHelp.bulletDesc': { en: 'A bullet-point item', pl: 'Punkt listy' },
  'formattingHelp.sectionNote': {
    en: 'Tip: leave an empty line between blocks to start a new section.',
    pl: 'Wskazówka: zostaw pustą linię między blokami, aby zacząć nową sekcję.',
  },

  // --- Cookbook form (components/cookbook/CookbookForm.tsx) ---
  'cookbookForm.coverTitle': { en: 'Cover photo', pl: 'Zdjęcie okładki' },
  'cookbookForm.missingNameMessage': {
    en: 'Please enter a cookbook name.',
    pl: 'Wpisz nazwę książki kucharskiej.',
  },
  'cookbookForm.name': { en: 'Cookbook name', pl: 'Nazwa książki kucharskiej' },
  'cookbookForm.namePlaceholder': {
    en: 'e.g. Desserts...',
    pl: 'np. Desery...',
  },

  // --- Shopping lists (app/(tabs)/shopping.tsx) ---
  'shopping.title': { en: 'Shopping', pl: 'Zakupy' },
  'shopping.emptyTitle': {
    en: 'No shopping lists',
    pl: 'Brak list zakupów',
  },
  'shopping.emptyText': {
    en: 'Create your first list and plan your shopping',
    pl: 'Stwórz pierwszą listę i zaplanuj zakupy',
  },
  'shopping.inCart': {
    en: '{checked}/{total} in cart',
    pl: '{checked}/{total} w koszyku',
  },
  'shopping.emptyAction': { en: 'Create a list', pl: 'Stwórz listę' },
  'shopping.rename': { en: 'Rename', pl: 'Zmień nazwę' },
  'shopping.shareList': { en: 'Share list', pl: 'Udostępnij listę' },
  'shopping.shareDialogTitle': {
    en: 'Shopping list',
    pl: 'Lista zakupów',
  },
  'shopping.deleteList': { en: 'Delete list', pl: 'Usuń listę' },

  // --- Delete confirmations (recipes & cookbooks get a speed bump on top of
  // the undo snackbar; shopping lists/items rely on undo alone) ---
  'confirm.deleteRecipe': {
    en: 'Delete "{title}"?',
    pl: 'Usunąć „{title}”?',
  },
  'confirm.deleteCookbook': {
    en: 'Delete "{name}"?',
    pl: 'Usunąć „{name}”?',
  },
  'confirm.deleteCookbookMessage': {
    en: "Recipes from this cookbook won't be deleted — you'll find them in 'All recipes'.",
    pl: 'Przepisy z tej książki nie zostaną usunięte — znajdziesz je w „Wszystkie przepisy”.',
  },

  // --- Shopping list detail (app/shopping/[id].tsx) ---
  'shoppingList.emptyTitle': {
    en: 'Your shopping list is empty',
    pl: 'Twoja lista zakupów jest pusta',
  },
  'shoppingList.emptyText': {
    en: 'Add products and build your shopping list',
    pl: 'Dodaj produkty i stwórz listę zakupów',
  },
  'shoppingList.addProduct': { en: 'Add product', pl: 'Dodaj produkt' },
  'shoppingList.inCartHeader': { en: 'In cart', pl: 'W koszyku' },
  'shoppingList.productNamePlaceholder': {
    en: 'Product name...',
    pl: 'Nazwa produktu...',
  },
  'shoppingList.addProductPlaceholder': {
    en: 'Add product...',
    pl: 'Dodaj produkt...',
  },
  'shoppingList.qtyPlaceholder': { en: 'Qty', pl: 'Ilość' },
  'shoppingList.pasteProducts': { en: 'Paste products', pl: 'Wklej produkty' },

  // --- Paste products into a shopping list (components/shopping/PasteListSheet.tsx, §5.16) ---
  'pasteList.title': { en: 'Paste products', pl: 'Wklej produkty' },
  'pasteList.placeholder': {
    en: 'Paste products, one per line',
    pl: 'Wklej produkty, każdy w nowej linii',
  },
  'pasteList.next': { en: 'Next', pl: 'Dalej' },
  'pasteList.empty': {
    en: 'No products found',
    pl: 'Nie znaleziono produktów',
  },

  // --- New / edit shopping list (app/shopping/new.tsx, edit.tsx) ---
  'shoppingNew.title': { en: 'New shopping list', pl: 'Nowa lista zakupów' },
  'shoppingNew.label': { en: 'List name', pl: 'Nazwa listy' },
  'shoppingNew.placeholder': {
    en: 'e.g. Weekly shop...',
    pl: 'np. Cotygodniowe zakupy...',
  },
  'shoppingNew.create': { en: 'Create list', pl: 'Stwórz listę' },
  'shoppingNew.missingNameMessage': {
    en: 'Please enter a list name.',
    pl: 'Wpisz nazwę listy.',
  },

  // --- Settings (app/settings.tsx) ---
  'settings.title': { en: 'Settings', pl: 'Ustawienia' },
  'settings.version': { en: 'Version {version}', pl: 'Wersja {version}' },
  'settings.yourData': { en: 'Your data', pl: 'Twoje dane' },
  'settings.noticeLocal': {
    en: 'Your recipes are stored only on this device. There are no accounts and no cloud sync.',
    pl: 'Twoje przepisy są przechowywane tylko na tym urządzeniu. Nie ma kont ani synchronizacji w chmurze.',
  },
  'settings.noticeUninstall': {
    en: 'Uninstalling the app deletes all of your recipes.',
    pl: 'Odinstalowanie aplikacji usuwa wszystkie Twoje przepisy.',
  },
  'settings.noticeExport': {
    en: 'Exporting a backup is the only way to protect your recipes — save it somewhere off this device.',
    pl: 'Eksport kopii zapasowej to jedyny sposób, by zabezpieczyć przepisy — zapisz ją poza tym urządzeniem.',
  },
  'settings.exportAll': {
    en: 'Export all data',
    pl: 'Eksportuj wszystkie dane',
  },
  'settings.exportAllHint': {
    en: 'Saves a complete backup — every recipe, photo and shopping list — to one .zip file. Use the share sheet to save it to Google Drive, Dropbox or email.',
    pl: 'Zapisuje pełną kopię zapasową — wszystkie przepisy, zdjęcia i listy zakupów — do jednego pliku .zip. Użyj arkusza udostępniania, aby zapisać go na Dysku Google, w Dropboksie lub wysłać mailem.',
  },
  'settings.exportAllDialogTitle': {
    en: 'Back up all data',
    pl: 'Kopia zapasowa danych',
  },
  'settings.exportPreparing': {
    en: 'Preparing backup…',
    pl: 'Przygotowywanie kopii…',
  },
  'settings.exportFailedTitle': { en: 'Export failed', pl: 'Eksport nieudany' },
  'settings.exportFailedMessage': {
    en: 'Could not export your data.',
    pl: 'Nie udało się wyeksportować danych.',
  },
  'settings.backupFolderUnwritableTitle': {
    en: "Folder can't be used",
    pl: 'Nie można użyć tego folderu',
  },
  'settings.backupFolderUnwritableMessage': {
    en: "This folder can't be written to. Google Drive on the phone isn't supported for automatic backup — pick a Dropbox or Nextcloud folder instead, or use “Export all data” above to save to Drive manually.",
    pl: 'Do tego folderu nie da się zapisywać. Google Drive na telefonie nie jest obsługiwany przy kopii automatycznej — wskaż folder Dropbox lub Nextcloud, albo użyj „Eksportuj wszystkie dane” powyżej, aby zapisać na Dysku ręcznie.',
  },
  'settings.import': { en: 'Restore backup', pl: 'Przywróć kopię zapasową' },
  'settings.importHint': {
    en: 'Restores from a .zip backup (recipes, photos and lists), or a legacy Markdown export.',
    pl: 'Przywraca z kopii .zip (przepisy, zdjęcia i listy) lub starszego eksportu Markdown.',
  },
  'settings.restoreLoading': {
    en: 'Reading backup…',
    pl: 'Wczytywanie kopii…',
  },
  'settings.restoreSaving': {
    en: 'Restoring your library…',
    pl: 'Przywracanie biblioteki…',
  },
  'settings.restoreChooseTitle': { en: 'Restore backup', pl: 'Przywróć kopię' },
  'settings.restoreChooseMessage': {
    en: 'This backup has {recipes} recipes. Your library already has data — replace everything with the backup, or add the backup to it?',
    pl: 'Ta kopia zawiera przepisy: {recipes}. Twoja biblioteka już zawiera dane — zastąpić wszystko kopią czy dodać kopię do istniejących danych?',
  },
  'settings.restoreReplace': { en: 'Replace all', pl: 'Zastąp wszystko' },
  'settings.restoreAdd': { en: 'Add to library', pl: 'Dodaj do biblioteki' },
  'settings.restoreReplacedTitle': { en: 'Backup restored', pl: 'Kopia przywrócona' },
  'settings.restoreReplacedMessage': {
    en: 'Your library now matches the backup.',
    pl: 'Twoja biblioteka odpowiada teraz kopii zapasowej.',
  },
  'settings.restoreAddedTitle': { en: 'Backup imported', pl: 'Kopia zaimportowana' },
  'settings.restoreAddedMessage': {
    en: 'The backup was added to your library.',
    pl: 'Kopia została dodana do Twojej biblioteki.',
  },
  'settings.importFailedZip': {
    en: 'This file is not a valid KeepTaste backup.',
    pl: 'Ten plik nie jest prawidłową kopią zapasową KeepTaste.',
  },
  'settings.autoBackup': { en: 'Automatic backup', pl: 'Automatyczna kopia' },
  'settings.autoBackupEnable': {
    en: 'Back up automatically',
    pl: 'Twórz kopię automatycznie',
  },
  'settings.autoBackupChooseFolder': {
    en: 'Choose folder',
    pl: 'Wybierz folder',
  },
  'settings.autoBackupChangeFolder': {
    en: 'Change folder',
    pl: 'Zmień folder',
  },
  'settings.autoBackupFolderSet': {
    en: 'Backup folder selected',
    pl: 'Wybrano folder kopii',
  },
  'settings.autoBackupNoFolder': {
    en: 'No folder selected yet',
    pl: 'Nie wybrano jeszcze folderu',
  },
  'settings.autoBackupLast': {
    en: 'Last backup: {date}',
    pl: 'Ostatnia kopia: {date}',
  },
  'settings.autoBackupNever': {
    en: 'Last backup: never',
    pl: 'Ostatnia kopia: nigdy',
  },
  'settings.autoBackupKeep': {
    en: 'Backups to keep',
    pl: 'Liczba kopii',
  },
  'settings.autoBackupKeepValue': {
    en: '{count} most recent',
    pl: '{count} najnowszych',
  },
  'settings.autoBackupKeepTitle': {
    en: 'How many backups to keep?',
    pl: 'Ile kopii przechowywać?',
  },
  'settings.autoBackupNote': {
    en: 'A backup is written after each change. Point the folder at a sync app (Dropbox, Nextcloud or Drive for desktop) to keep an off-device copy. For Google Drive on the phone, use the share sheet above instead.',
    pl: 'Kopia jest zapisywana po każdej zmianie. Wskaż folder synchronizowany przez Dropbox, Nextcloud lub Dysk Google na komputerze, aby mieć kopię poza urządzeniem. Dla Dysku Google na telefonie użyj arkusza udostępniania powyżej.',
  },
  'settings.dangerZone': { en: 'Danger zone', pl: 'Strefa zagrożenia' },
  'settings.deleteAll': { en: 'Delete all data', pl: 'Usuń wszystkie dane' },
  'settings.deleteHint': {
    en: 'Permanently erases every cookbook, recipe and shopping list on this device.',
    pl: 'Trwale usuwa wszystkie książki kucharskie, przepisy i listy zakupów z tego urządzenia.',
  },
  'settings.language': { en: 'Language', pl: 'Język' },
  'settings.languageSystem': { en: 'System', pl: 'Systemowy' },
  'settings.languageEnglish': { en: 'English', pl: 'English' },
  'settings.languagePolish': { en: 'Polski', pl: 'Polski' },
  'settings.chooseLanguage': { en: 'Choose language', pl: 'Wybierz język' },

  // Settings: import confirmation / results
  'settings.importCompleteTitle': {
    en: 'Import complete',
    pl: 'Import zakończony',
  },
  'settings.importCompleteOne': {
    en: 'Imported "{name}" with {count} recipe.',
    pl: 'Zaimportowano „{name}” z {count} przepisem.',
  },
  'settings.importCompleteFew': {
    en: 'Imported "{name}" with {count} recipes.',
    pl: 'Zaimportowano „{name}” z {count} przepisami.',
  },
  'settings.importCompleteMany': {
    en: 'Imported "{name}" with {count} recipes.',
    pl: 'Zaimportowano „{name}” z {count} przepisami.',
  },
  // Settings: full-app backup import (multi-cookbook).
  // Cookbook and recipe counts are pluralized independently via the
  // *CookbooksAcc / *RecipesAcc / *RecipesInstr fragments (Polish needs
  // accusative after "zaimportowano/zaimportować" and instrumental after "z").
  'settings.importBackupComplete': {
    en: 'Imported {cookbooks} and {recipes}.',
    pl: 'Zaimportowano {cookbooks} i {recipes}.',
  },
  'settings.importBackupConfirmTitle': {
    en: 'Import backup?',
    pl: 'Zaimportować kopię zapasową?',
  },
  'settings.importBackupConfirm': {
    en: 'Import {cookbooks} with {recipes}?',
    pl: 'Zaimportować {cookbooks} z {recipes}?',
  },
  'settings.backupCookbooksAccOne': {
    en: '{count} cookbook',
    pl: '{count} książkę',
  },
  'settings.backupCookbooksAccFew': {
    en: '{count} cookbooks',
    pl: '{count} książki',
  },
  'settings.backupCookbooksAccMany': {
    en: '{count} cookbooks',
    pl: '{count} książek',
  },
  'settings.backupRecipesAccOne': {
    en: '{count} recipe',
    pl: '{count} przepis',
  },
  'settings.backupRecipesAccFew': {
    en: '{count} recipes',
    pl: '{count} przepisy',
  },
  'settings.backupRecipesAccMany': {
    en: '{count} recipes',
    pl: '{count} przepisów',
  },
  'settings.backupRecipesInstrOne': {
    en: '{count} recipe',
    pl: '{count} przepisem',
  },
  'settings.backupRecipesInstrFew': {
    en: '{count} recipes',
    pl: '{count} przepisami',
  },
  'settings.backupRecipesInstrMany': {
    en: '{count} recipes',
    pl: '{count} przepisami',
  },
  'settings.importFailedTitle': { en: 'Import failed', pl: 'Import nieudany' },
  'settings.importFailedSaving': {
    en: 'Something went wrong while saving. The cookbook may have been imported partially.',
    pl: 'Coś poszło nie tak podczas zapisywania. Książka mogła zostać zaimportowana częściowo.',
  },
  'settings.importFailedRead': {
    en: 'Could not read the selected file.',
    pl: 'Nie udało się odczytać wybranego pliku.',
  },
  'settings.importConfirmTitle': {
    en: 'Import cookbook?',
    pl: 'Zaimportować książkę kucharską?',
  },
  'settings.importConfirmOne': {
    en: 'Import "{name}" with {count} recipe?',
    pl: 'Zaimportować „{name}” z {count} przepisem?',
  },
  'settings.importConfirmFew': {
    en: 'Import "{name}" with {count} recipes?',
    pl: 'Zaimportować „{name}” z {count} przepisami?',
  },
  'settings.importConfirmMany': {
    en: 'Import "{name}" with {count} recipes?',
    pl: 'Zaimportować „{name}” z {count} przepisami?',
  },
  'settings.importAction': { en: 'Import', pl: 'Importuj' },
  'settings.deleteAllTitle': {
    en: 'Delete all data?',
    pl: 'Usunąć wszystkie dane?',
  },
  'settings.deleteAllMessage': {
    en: 'This will remove every cookbook, recipe and shopping list stored on this device, along with their images.',
    pl: 'To usunie wszystkie książki kucharskie, przepisy i listy zakupów z tego urządzenia, wraz z ich zdjęciami.',
  },
  'settings.deleteFinalTitle': {
    en: 'This cannot be undone',
    pl: 'Tej operacji nie można cofnąć',
  },
  'settings.deleteFinalMessage': {
    en: 'All cookbooks and recipes will be permanently erased from this device.',
    pl: 'Wszystkie książki kucharskie i przepisy zostaną trwale usunięte z tego urządzenia.',
  },
  'settings.deleteEverything': {
    en: 'Delete everything',
    pl: 'Usuń wszystko',
  },
} as const;

export type TranslationKey = keyof typeof dictionary;
