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
  'common.whatToDo': {
    en: 'What would you like to do?',
    pl: 'Co chcesz zrobić?',
  },
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
  'stack.renameList': { en: 'Rename list', pl: 'Zmień nazwę listy' },
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
  'home.brand': { en: 'KeepTaste', pl: 'KeepTaste' },
  'home.title': { en: 'Cookbooks', pl: 'Książki kucharskie' },
  'home.allRecipes': { en: 'All recipes', pl: 'Wszystkie przepisy' },
  'home.emptyTitle': { en: 'No cookbooks', pl: 'Brak książek kucharskich' },
  'home.emptyText': {
    en: 'Tap + to create your first cookbook',
    pl: 'Naciśnij +, aby stworzyć pierwszą książkę kucharską',
  },
  'home.deleteTitle': { en: 'Delete "{name}"?', pl: 'Usunąć „{name}”?' },
  'home.deleteMessage': {
    en: "Recipes from this cookbook won't be deleted — you'll find them in 'All recipes'.",
    pl: 'Przepisy z tej książki nie zostaną usunięte — znajdziesz je w „Wszystkie przepisy”.',
  },

  // --- Cookbook / recipes grid (app/cookbook/[id].tsx) ---
  'cookbook.searchPlaceholder': {
    en: 'Search recipes...',
    pl: 'Szukaj przepisów...',
  },
  'cookbook.noResults': { en: 'No results', pl: 'Brak wyników' },
  'cookbook.emptyRecipes': {
    en: 'No recipes. Tap + to add your first one.',
    pl: 'Brak przepisów. Naciśnij +, aby dodać pierwszy.',
  },
  'cookbook.exportFailedTitle': { en: 'Export failed', pl: 'Eksport nieudany' },
  'cookbook.exportFailedMessage': {
    en: 'Could not export the cookbook.',
    pl: 'Nie udało się wyeksportować książki kucharskiej.',
  },
  'cookbook.minutes': { en: '{count} min', pl: '{count} min' },
  'cookbook.servings': { en: '{count} servings', pl: '{count} porcji' },

  // --- Recipe view (app/recipe/[id].tsx) ---
  'recipe.deleteTitle': { en: 'Delete recipe', pl: 'Usuń przepis' },
  'recipe.deleteMessage': {
    en: 'Are you sure you want to delete "{title}"?',
    pl: 'Czy na pewno chcesz usunąć „{title}”?',
  },
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
  'addToList.addedTitle': { en: 'Added to list', pl: 'Dodano do listy' },
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
  'addToList.ok': { en: 'OK', pl: 'OK' },

  // --- Recipe form (components/recipe/RecipeForm.tsx) ---
  'recipeForm.photoTitle': { en: 'Photo', pl: 'Zdjęcie' },
  'recipeForm.photoMessage': {
    en: 'Where would you like to add a photo from?',
    pl: 'Skąd chcesz dodać zdjęcie?',
  },
  'recipeForm.missingTitle': { en: 'Missing title', pl: 'Brak tytułu' },
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
  'recipeForm.ingredientsHint': {
    en: 'Use a double line break to separate sections. A dash (-) creates a bullet point.',
    pl: 'Użyj podwójnego entera, aby oddzielić sekcje. Myślnik (-) tworzy punkt listy.',
  },
  'recipeForm.ingredientsPlaceholder': {
    en: '200g flour\n100g butter\n- 3 eggs\n\n#Cream\n300ml heavy cream',
    pl: '200g mąki\n100g masła\n- 3 jajka\n\n#Krem\n300ml śmietanki kremówki',
  },
  'recipeForm.instructions': { en: 'Instructions', pl: 'Przygotowanie' },
  'recipeForm.instructionsHint': {
    en: 'Supports Markdown: # heading, **bold**',
    pl: 'Obsługuje Markdown: # nagłówek, **pogrubienie**',
  },
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

  // --- Cookbook form (components/cookbook/CookbookForm.tsx) ---
  'cookbookForm.coverTitle': { en: 'Cover photo', pl: 'Zdjęcie okładki' },
  'cookbookForm.coverMessage': {
    en: 'Where would you like to add a photo from?',
    pl: 'Skąd chcesz dodać zdjęcie?',
  },
  'cookbookForm.missingName': { en: 'Missing name', pl: 'Brak nazwy' },
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
  'shopping.brand': { en: 'KeepTaste', pl: 'KeepTaste' },
  'shopping.title': { en: 'Shopping', pl: 'Zakupy' },
  'shopping.emptyTitle': {
    en: 'No shopping lists',
    pl: 'Brak list zakupów',
  },
  'shopping.emptyText': {
    en: 'Tap + to create your first list',
    pl: 'Naciśnij +, aby stworzyć pierwszą listę',
  },
  'shopping.inCart': {
    en: '{checked}/{total} in cart',
    pl: '{checked}/{total} w koszyku',
  },
  'shopping.rename': { en: 'Rename', pl: 'Zmień nazwę' },
  'shopping.deleteListMessage': {
    en: 'Delete this shopping list?',
    pl: 'Usunąć tę listę zakupów?',
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

  // --- New / edit shopping list (app/shopping/new.tsx, edit.tsx) ---
  'shoppingNew.title': { en: 'New shopping list', pl: 'Nowa lista zakupów' },
  'shoppingNew.label': { en: 'List name', pl: 'Nazwa listy' },
  'shoppingNew.placeholder': {
    en: 'e.g. Weekly shop...',
    pl: 'np. Cotygodniowe zakupy...',
  },
  'shoppingNew.create': { en: 'Create list', pl: 'Stwórz listę' },
  'shoppingNew.missingName': { en: 'Missing name', pl: 'Brak nazwy' },
  'shoppingNew.missingNameMessage': {
    en: 'Please enter a list name.',
    pl: 'Wpisz nazwę listy.',
  },
  'shoppingEdit.title': { en: 'Rename list', pl: 'Zmień nazwę listy' },

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
    en: 'Exporting a cookbook to Markdown is the only way to back up your recipes.',
    pl: 'Eksport książki kucharskiej do Markdown to jedyny sposób na kopię zapasową przepisów.',
  },
  'settings.import': { en: 'Import from Markdown', pl: 'Importuj z Markdown' },
  'settings.importHint': {
    en: 'Adds a new cookbook from a previously exported Markdown file.',
    pl: 'Dodaje nową książkę kucharską z wcześniej wyeksportowanego pliku Markdown.',
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
