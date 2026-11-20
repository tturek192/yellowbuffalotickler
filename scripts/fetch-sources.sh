#!/usr/bin/env bash
# Download the research sources into .cache/sources (gitignored; never committed).
# Idempotent: every step skips a file that already exists, so it can be re-run after a failure.
#
#   bash scripts/fetch-sources.sh
#
# Needs curl, python3, and pdftotext and pdfimages (poppler-utils).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/.cache/sources"
mkdir -p "$OUT"

for tool in curl pdftotext pdfimages python3; do
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
extract 295 sketch-39-battles-of-scarpe # p. 264

# --- Unit histories on archive.org (Task 8): the OCR text of each book --------------------------------------
# archive.org's download links redirect to storage hosts outside the allowed list, so the text is read from the
# item's "stream" page, which wraps it in <pre>…</pre>.
archive_text() { # archive_text <archive.org identifier> <output name>
  local out="$OUT/$2.txt"
  if [ ! -s "$out" ]; then
    echo "fetch-sources: downloading $1 (archive.org full text)"
    curl -fsS -o "$out.html" "https://archive.org/stream/$1/$1_djvu.txt"
    python3 -I -c 'import html, re, sys
page = open(sys.argv[1], encoding="utf-8", errors="replace").read()
m = re.search(r"<pre[^>]*>(.*?)</pre>", page, re.S)
if not m: sys.exit("fetch-sources: no <pre> text in " + sys.argv[1])
open(sys.argv[2], "w", encoding="utf-8").write(html.unescape(m.group(1)))' "$out.html" "$out.part"
    rm -f "$out.html"
    mv "$out.part" "$out"
  fi
}
archive_text fifthdivisioning00huss hussey-inman-1921      # The Fifth Division in the Great War
archive_text 72seaforthhigh00mcevuoft mcevoy-finlay-1920   # History of the 72nd Battalion
archive_text eightyfifthinfra00hayeuoft hayes-1920         # The Eighty-Fifth in France and Flanders
archive_text tenthbattalion00holluoft holland-1918         # The Story of the Tenth Canadian Battalion

# --- English Wikipedia, the exact revisions cited (Task 8) -------------------------------------------------
WIKI="$OUT/wikipedia"
mkdir -p "$WIKI"
wiki_rev() { # wiki_rev <revision id>; en.wikipedia.org rate-limits, so wait between requests
  if [ ! -s "$WIKI/$1.wiki" ]; then
    curl -fsS -A "wwi-sim-research/0.1" -o "$WIKI/$1.wiki.part" "https://en.wikipedia.org/w/index.php?oldid=$1&action=raw"
    mv "$WIKI/$1.wiki.part" "$WIKI/$1.wiki"
    sleep 2
  fi
}
# Battle of Vimy Ridge order of battle; then the CEF battalion articles whose lists of commanding officers are cited
# (the last, the 87th's, is cited in leaders.md for having no officer for 9 April).
for rev in 1283223092 \
  1375579158 1356545002 1386529871 1328939893 1375579163 1386532405 1325400995 1386533139 1379968631 1386535720 \
  1379481661 1381494295 1375578992 1386348707 1386714836 1345849028 1379890539 1386783789 1375428624 1381442040 \
  1308898073 1335680448 1386298168; do
  wiki_rev "$rev"
done

size=$(wc -c <"$NICHOLSON_TXT")
if [ "$size" -le 1000000 ]; then
  echo "fetch-sources: $NICHOLSON_TXT is only $size bytes; expected more than 1 MB" >&2
  exit 1
fi
echo "fetch-sources: done ($NICHOLSON_TXT: $size bytes; maps in $MAPS)"
