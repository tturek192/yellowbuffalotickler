#!/usr/bin/env bash
# Download the research sources into .cache/sources (gitignored; never committed).
# Idempotent: every step skips a file that already exists, so it can be re-run after a failure.
#
#   bash scripts/fetch-sources.sh
#
# Needs curl, and pdftotext and pdfimages (poppler-utils).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/.cache/sources"
mkdir -p "$OUT"

for tool in curl pdftotext pdfimages; do
  command -v "$tool" >/dev/null || { echo "fetch-sources: $tool is required" >&2; exit 1; }
done

# --- Nicholson, Canadian Expeditionary Force 1914-1919 (1962): the Canadian official history ---------
NICHOLSON_URL="https://publications.gc.ca/collections/collection_2009/forces/DA3-4462E.pdf"
NICHOLSON_PDF="$OUT/nicholson-1962.pdf"
if [ ! -s "$NICHOLSON_PDF" ]; then
  echo "fetch-sources: downloading Nicholson 1962 (about 33 MB)"
  jar="$(mktemp)"
  trap 'rm -f "$jar" "$NICHOLSON_PDF.part"' EXIT
  # publications.gc.ca serves archived content only after its interstitial page has set a cookie.
  interstitial="https://publications.gc.ca/site/archivee-archived.html"
  curl -fsS -c "$jar" -b "$jar" -L -o /dev/null \
    "$interstitial?url=https%3A%2F%2Fpublications.gc.ca%2Fcollections%2Fcollection_2009%2Fforces%2FDA3-4462E.pdf"
  curl -fsS -c "$jar" -b "$jar" -L -e "$interstitial" -o "$NICHOLSON_PDF.part" "$NICHOLSON_URL"
  if [ "$(head -c 5 "$NICHOLSON_PDF.part")" != "%PDF-" ]; then
    echo "fetch-sources: $NICHOLSON_URL did not return a PDF (the archive interstitial may have changed)" >&2
    exit 1
  fi
  mv "$NICHOLSON_PDF.part" "$NICHOLSON_PDF"
  rm -f "$jar"
  trap - EXIT
fi

NICHOLSON_TXT="$OUT/nicholson-1962.txt"
if [ ! -s "$NICHOLSON_TXT" ]; then
  echo "fetch-sources: extracting Nicholson text"
  pdftotext -layout "$NICHOLSON_PDF" "$NICHOLSON_TXT.part"
  mv "$NICHOLSON_TXT.part" "$NICHOLSON_TXT"
fi

# Chapter VIII, "The Battle of Vimy Ridge, 9-14 April 1917" (book pp. 233-268, PDF pages 261-299),
# says "(See Map 7 and Sketches 37-39)". These are the PDF pages holding those images.
MAPS="$OUT/nicholson-maps"
mkdir -p "$MAPS"
extract() { # extract <pdf page> <name>
  if [ ! -s "$MAPS/$2.png" ]; then
    pdfimages -png -f "$1" -l "$1" "$NICHOLSON_PDF" "$MAPS/$2"
    mv "$MAPS/$2-000.png" "$MAPS/$2.png"
  fi
}
extract 293 map-7-vimy-ridge            # colour fold-out, facing book p. 262; 2550 x 1423 px
extract 263 sketch-37-balkan-front-1916 # p. 235; a 1-bit stencil, so it comes out white on black
extract 265 sketch-38-nivelle-plan      # p. 237
extract 295 sketch-39-battles-of-scarpe # p. 265

size=$(wc -c <"$NICHOLSON_TXT")
if [ "$size" -le 1000000 ]; then
  echo "fetch-sources: $NICHOLSON_TXT is only $size bytes; expected more than 1 MB" >&2
  exit 1
fi
echo "fetch-sources: done ($NICHOLSON_TXT: $size bytes; maps in $MAPS)"
