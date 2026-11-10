# shellcheck shell=bash
# persona-lab config for a study of recipe import only. Everything comes from
# ../config/config.sh except what is below.
#
#   caffeinate -i bash persona-lab/engine/run.sh persona-lab/config-import \
#     --personas-file persona-lab/config-import/personas.json
#
# Each state is one import path: the persona starts with the real thing on the
# phone (a copied link or text, a photo in the gallery, a share from the
# browser), so the study doesn't depend on what the rig can type. Materials are
# in clipboard/ and photos/; the personas are written by hand to match them.

# shellcheck source=/dev/null
source "$CONFIG_DIR/../config/config.sh"

# The state names the base config restores to before this study's setup.
eval "$(declare -f reset_app | sed '1s/reset_app/base_reset_app/')"

STATES="link_ok link_microdata paste_mom paste_blog paste_insta photo_book photo_card share_link"

STATE_PERSONA_link_ok="You have just installed the app from the store and are opening it for the first time. None of your own recipes are in it yet. A moment ago you copied a recipe link in your browser, so it is on your phone's clipboard."
STATE_PERSONA_link_microdata="You have been using this app for a few weeks. Your cookbooks and recipes are already in it. A moment ago you copied a recipe link in your browser, so it is on your phone's clipboard."
STATE_PERSONA_paste_mom="You have been using this app for a few weeks. Your cookbooks and recipes are already in it. A moment ago you copied a message from a chat, so its whole text is on your phone's clipboard."
STATE_PERSONA_paste_blog="You have just installed the app from the store and are opening it for the first time. None of your own recipes are in it yet. A moment ago you selected and copied the recipe from a web page, so that text is on your phone's clipboard."
STATE_PERSONA_paste_insta="You have just installed the app from the store and are opening it for the first time. None of your own recipes are in it yet. A moment ago you copied a post's caption, so that text is on your phone's clipboard."
STATE_PERSONA_photo_book="You have just installed the app from the store and are opening it for the first time. None of your own recipes are in it yet. The photo you want to use is already in your phone's gallery, it is the newest one."
STATE_PERSONA_photo_card="You have been using this app for a few weeks. Your cookbooks and recipes are already in it. The photo you want to use is already in your phone's gallery, it is the newest one."
STATE_PERSONA_share_link="You have been using this app for a few weeks. Your cookbooks and recipes are already in it. A moment ago, reading a recipe page in your browser, you tapped Share and picked this app. What you see now is what opened."

reset_app() {
  case "$1" in
    link_ok | paste_blog | paste_insta | photo_book) base_reset_app fresh "$2" ;;
    link_microdata | paste_mom | photo_card | share_link) base_reset_app demo "$2" ;;
    *) return 1 ;;
  esac
}

SHARE_URL="https://www.doradcasmaku.pl/przepis-ciasteczka-paluchy-wiedzmy-387994"

state_ready() {
  local clip=""
  case "$1" in
    link_ok) clip=url-ok.txt ;;
    link_microdata) clip=url-microdata.txt ;;
    paste_mom) clip=wiadomosc-od-mamy.txt ;;
    paste_blog) clip=blog-cala-strona.txt ;;
    paste_insta) clip=insta-caption.txt ;;
    photo_book) gallery_add "$CONFIG_DIR/photos/strona-z-ksiazki.jpg" ;;
    photo_card) gallery_add "$CONFIG_DIR/photos/kartka-babci.jpg" ;;
    share_link)
      # A cold start, the same as a share from the browser with the app closed.
      app_stop
      adbs shell am start -a android.intent.action.SEND -t text/plain \
        --es android.intent.extra.TEXT "'$SHARE_URL'" -n "$APP_ID/.MainActivity" >/dev/null
      app_wait_ready 30
      ;;
  esac
  if [ -n "$clip" ]; then
    clipboard_set "$CONFIG_DIR/clipboard/$clip" || return 1
    app_start
    app_wait_ready 30
  fi
}

MAX_BUDGET_SYNTHESIS=8.00

SYNTHESIS_FOCUS="FOCUS:this study covers recipe import only (SPEC.md §5.15), one persona per import path. For each persona, the source material is in persona-lab/config-import/ (clipboard/*.txt, photos/*.jpg) and in its 'materials' in personas.json. Compare it field by field with what landed in the form on the screenshots (title, times, servings, ingredients, instructions, notes) and say for every defect whether the parser, OCR, the source data or the UI caused it; check utils/recipeImport.ts and utils/ocrText.ts before naming a cause. Open with a table in Podsumowanie, one row per path: path | runs | found the entry point | import ran | field quality | saved | where it broke. Judge each promise of the store listing's import section against the result. Rig limits to account for, not to report as app bugs: after a failed link the persona cannot go back to the browser, so it types the text from its materials; the emulator has no AI app, so the AI path ends at the share sheet and the persona types the AI's reply from its materials, without Polish diacritics. Known before the study: kwestiasmaku.com, mojewypieki.com and aniagotuje.pl have no JSON-LD Recipe, only microdata, and only aniagotuje.pl marks up ingredients and steps there."
