#!/bin/zsh
# Renderiza as artes da tela de Novidades (390×380 CSS @3x = 1170×1140, o tamanho que o
# editor do backoffice recomenda) com o Chrome headless e converte para WebP.
#
#   docs/app-news-art/render.sh            # todas
#   docs/app-news-art/render.sh equipes    # uma
#
# O essencial de cada arte fica na faixa x 57–333 / y 85–295 (CSS): é o que sobra nos três
# recortes do app (destaque 1,86:1, detalhe 1,06:1, stories 0,73:1). O topo fica livre porque,
# no detalhe, a imagem começa embaixo da barra de status.
set -e
DIR=${0:A:h}
REPO=${DIR:h:h}
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
    --user-data-dir="$PROFILE" --force-device-scale-factor=3 --window-size=390,380 \
    --virtual-time-budget=3000 --screenshot="$DIR/$n.png" "file://$DIR/$n.html" >/dev/null 2>&1
  cwebp -quiet -q 90 -m 6 "$DIR/$n.png" -o "$DIR/$n.webp"
  rm "$DIR/$n.png"
  echo "$n.webp"
done
