#!/bin/bash
# Crops the staged food photos in assets/store/ down to the dish, into
# assets/store/crops/. build-demo-backup.ts reads photos from there, so the
# demo library shows food instead of a whole styled breakfast table — and the
# crops keep the Polish product packaging in the background out of the English
# store screenshots.
#
# The wide originals stay in assets/store/ as the master copies; this script is
# the record of how the crops were derived. macOS only (uses sips).
#
# Run from the repo root:  bash scripts/crop-demo-photos.sh
set -euo pipefail

STORE="assets/store"
OUT="$STORE/crops"
mkdir -p "$OUT"

# name  width height offsetX offsetY  (sources are all 1408x768)
crop() {
  cp "$STORE/$1.png" "$OUT/$1.png"
  sips -c "$3" "$2" --cropOffset "$5" "$4" "$OUT/$1.png" --out "$OUT/$1.png" >/dev/null
  echo "  $1.png -> ${2}x${3} @ ${4},${5}"
}

# Recipe photos: tight on the plate. The top and left edges are the ones that
# matter — that is where the staged Polish packaging sits ("JAJKA EKOLOGICZNE"
# on the egg carton, "MIÓD WIELOKWIATOWY" on the honey jar). The recipe *view*
# shows this photo as a full-width hero, so anything left in the crop ends up
# legible in the English store screenshots.
crop pancakes   580 325 455 443
crop oatmeal    560 330 470 420
crop fried-eggs 580 340 450 400

# Breakfasts cover: the bowl + avocado toast, clear of the labelled packaging.
crop breakfast  700 300 250 468

# Italian Kitchen cover: the staged table carries four real pasta/oil brands
# (Monini, Barilla, De Cecco, Rummo), all with mangled lettering. Crop to the
# loose ingredients in the middle of the table, which is clear of every one of
# them: basil, tomatoes, garlic, parmesan and olives.
crop italian    420 315 585 300

# The remaining covers work as shot — copied through unchanged so the demo
# builder can read every photo from one directory.
for f in dessert dinner; do
  cp "$STORE/$f.png" "$OUT/$f.png"
  echo "  $f.png -> unchanged"
done

echo "Wrote crops to $OUT"
