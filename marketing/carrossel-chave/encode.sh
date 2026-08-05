#!/usr/bin/env bash
# Monta os dois MP4 do carrossel a partir dos PNGs renderizados.
# O loop base tem 3,4s; o arquivo final repete 3x (10,2s) para o espectador
# pegar o evento mesmo se o Instagram não repetir o vídeo sozinho.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
FFMPEG="${FFMPEG:-$HERE/node_modules/ffmpeg-static/ffmpeg}"
OUT="$HERE/out"
mkdir -p "$OUT"

for CARD in 1 2; do
  "$FFMPEG" -y -loglevel error \
    -framerate 30 -i "$HERE/frames$CARD/%04d.png" \
    -c:v libx264 -pix_fmt yuv420p -profile:v high -level 4.0 -crf 17 \
    "$OUT/loop$CARD.mp4"

  # 3 voltas + faixa de áudio muda (alguns players do IG engasgam sem áudio)
  "$FFMPEG" -y -loglevel error \
    -stream_loop 2 -i "$OUT/loop$CARD.mp4" \
    -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 \
    -c:v copy -c:a aac -b:a 96k -shortest -movflags +faststart \
    "$OUT/smq-carrossel-chave-card$CARD.mp4"

  rm -f "$OUT/loop$CARD.mp4"
done

# capas estáticas, úteis para thumbnail e para conferir o corte da costura
cp "$HERE/frames1/0000.png" "$OUT/capa-card1.png"
cp "$HERE/frames2/0030.png" "$OUT/capa-card2.png"

ls -la "$OUT"
