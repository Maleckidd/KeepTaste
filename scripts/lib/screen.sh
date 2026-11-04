# shellcheck shell=bash
#
# Screen landmarks for a **1080x2400 phone with gesture navigation**, in the
# light theme. Sourced by reset-demo-library.sh and record-promo-clips.sh.
#
# The scripts drive the app blind: the app is a release build, so there is no
# view hierarchy to query and no way in but tapping where a control happens to
# be. Every coordinate below is therefore a bet on the current layout, and this
# file exists so that a UI change is one file to re-measure instead of a hunt
# through two scripts.
#
# They are *layout* positions rather than text positions, so they survive the
# EN/PL switch. What moves them: a changed screen layout, a different screen
# size or density, and three-button navigation (which lifts the whole tab bar).
#
# To re-measure one: put the app on that screen and read the coordinates off a
# screenshot —
#
#   adb exec-out screencap -p > /tmp/s.png && open /tmp/s.png
#
# Preview's inspector reports pixel coordinates directly, and the origin is the
# top-left corner, same as `input tap`.

# --- colours polled with wait_for_pixel --------------------------------------

# Brand primary (constants/theme.ts). Painted by the selected tab icon and the
# "+" button, both of which are used as "the app has finished launching" signals.
COLOR_PRIMARY=c84b31
# App background. Where a cookbook tile would be if the grid were full.
COLOR_SURFACE=fafaf7

# --- home screen -------------------------------------------------------------

# The selected "Recipes" tab icon. The readiness signal for a screen that may be
# *empty*: it is painted in both states reset-demo-library.sh sees, the empty
# library `pm clear` leaves behind and the populated one after a restore.
TAB_RECIPES_PIXEL="250 2270"
# The "Shopping" tab.
TAB_SHOPPING="808 2280"

# The "+" button on the home screen. The readiness signal for a screen that is
# known to be *populated* — an empty library has no "+", so waiting on it there
# just times out. Note this "+" creates a cookbook, not a recipe.
FAB_HOME="915 2040"

# Settings, top right of the home screen.
SETTINGS_BUTTON="979 152"

# First cookbook tile of the grid — "Breakfasts" in the demo library.
CB_FIRST="283 660"
# Bottom-right tile of a 2x2 grid. Reading COLOR_SURFACE here means the grid is
# not full: the demo library fills all four, the first-launch seed has one.
GRID_BOTTOM_RIGHT="800 1175"

# --- settings ----------------------------------------------------------------

SETTINGS_LANGUAGE="540 684"
# "Restore backup", after one scroll down to the backup section.
SETTINGS_RESTORE="540 1133"
# "Polski" in the language action sheet.
LANGUAGE_PL="540 2119"
# "OK" on the "Backup restored" dialog.
DIALOG_OK="893 1332"

# --- cookbook ----------------------------------------------------------------

# The "+" inside a cookbook — lower than the home one, which sits above the tab
# bar. Only this one creates a recipe.
FAB_RECIPE="954 2214"
# Third recipe card of the Breakfasts list — Ricotta Pancakes.
RECIPE_THIRD="540 1716"

# --- recipe form / import sheet ----------------------------------------------

# "Import from a link, text or photo", top of the new-recipe form.
IMPORT_BUTTON="540 322"
# "Paste text" tile, top-right of the import sheet.
MODE_PASTE_TEXT="793 1723"

# --- recipe view / add-to-list sheet -----------------------------------------

# "Add to shopping list", one drag below the top of the recipe.
ADD_TO_LIST="540 1594"
# The two ingredient-group headers ("Batter:", "To serve:"), unchecked on
# purpose in the promo take — they are not products.
SHEET_ITEM1="540 337"
SHEET_ITEM2="540 1477"
# "Add N products", with the sheet scrolled to the bottom.
SHEET_CONFIRM="540 2149"

# --- shopping ----------------------------------------------------------------

# The single list card on the Shopping tab.
LIST_CARD="540 348"
# First row of an open shopping list. Ticking a row moves it into "In cart", so
# tapping the same spot repeatedly ticks off successive items.
LIST_ROW1="540 294"
