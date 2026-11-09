#!/bin/zsh
# Ilustrações do corpo dos posts "Guia do app" do blog: 800×450 CSS @2x = 1600×900 (16:9, ≥1200 de largura).
#   docs/blog-art/guia/render.sh          # todas
#   docs/blog-art/guia/render.sh focus    # uma
set -e
DIR=${0:A:h}
REPO=${DIR:h:h:h}
CH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
MI="$(dirname "$(dirname "$(which flutter)")")/bin/cache/artifacts/material_fonts/MaterialIcons-Regular.otf"
FONTS="$REPO/nexago_app/assets/fonts"
cat > "$DIR/fonts.css" <<CSS
@font-face { font-family: Sora; src: url('file://$FONTS/Sora/Sora-Variable.ttf'); font-weight: 100 800; }
@font-face { font-family: JB; src: url('file://$FONTS/JetBrainsMono/JetBrainsMono-Bold.ttf'); font-weight: 700; }
@font-face { font-family: MI; src: url('file://$MI'); }
CSS
PROFILE=$(mktemp -d)
trap 'rm -rf "$PROFILE" "$DIR/fonts.css"' EXIT
names=(${@:-${(f)"$(cd "$DIR" && ls *.html | sed 's/\.html$//')"}})
for n in $names; do
  "$CH" --headless=new --disable-gpu --hide-scrollbars --allow-file-access-from-files \
    --user-data-dir="$PROFILE" --force-device-scale-factor=2 --window-size=800,450 \
    --virtual-time-budget=3000 --screenshot="$DIR/$n.png" "file://$DIR/$n.html" >/dev/null 2>&1
  cwebp -quiet -q 92 -m 6 "$DIR/$n.png" -o "$DIR/$n.webp"
  rm "$DIR/$n.png"
  echo "$n.webp"
done
