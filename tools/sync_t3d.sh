#!/bin/sh
# Copy the 3D tutor (../Phonics-Match-3D: embed.html, src/, lib/) into public/t3d, so the built game serves it itself:
# the deployed ?tutor=3d loads ./t3d/embed.html, while the dev server keeps using the live copy on :5198.
# Run before every deploy that should carry 3D tutor changes:  sh tools/sync_t3d.sh
set -e
cd "$(dirname "$0")/.."
SRC=../Phonics-Match-3D
[ -f "$SRC/embed.html" ] || { echo "no $SRC/embed.html" >&2; exit 1; }
rm -rf public/t3d
mkdir -p public/t3d
cp -p "$SRC/embed.html" public/t3d/
cp -Rp "$SRC/src" "$SRC/lib" public/t3d/
find public/t3d -name .DS_Store -delete
echo "public/t3d: $(find public/t3d -type f | wc -l | tr -d ' ') files, $(du -sh public/t3d | cut -f1)"
