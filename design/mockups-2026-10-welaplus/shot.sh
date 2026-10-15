#!/bin/bash
# Regenerate preview.png with the locally installed Google Chrome (no Playwright, no npm deps),
# and fail loudly if any frame clips. Same check as ../mockups-2026-07-c/shot.mjs: a phone is a
# hard-clipped box, so content that overruns is silently guillotined and then looks like a
# design choice in a PNG.
#
#   ./shot.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

sed 's#</body>#<script>document.fonts.ready.then(()=>{const o=[...document.querySelectorAll(".phone,.tablet")].map((p,i)=>({frame:i+1,frame_px:p.scrollHeight-p.clientHeight,body_px:Math.max(0,...[...p.querySelectorAll(".body")].map(b=>b.scrollHeight-b.clientHeight))})).filter(x=>x.frame_px>1||x.body_px>1);document.body.setAttribute("data-over",JSON.stringify(o));});</script></body>#' \
  "$HERE/index.html" > "$HERE/.check.html"
OVER=$("$CHROME" --headless=new --disable-gpu --virtual-time-budget=4000 --dump-dom "file://$HERE/.check.html" 2>/dev/null \
  | grep -oE 'data-over="[^"]*"' | sed 's/&quot;/"/g; s/^data-over="//; s/"$//')
rm -f "$HERE/.check.html"
if [ "$OVER" != "[]" ]; then echo "CLIPPED: $OVER"; else echo "no clipping"; fi

"$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
  --window-size=1420,3300 --virtual-time-budget=4000 \
  --screenshot="$HERE/preview.png" "file://$HERE/index.html" 2>/dev/null
echo "wrote $HERE/preview.png"
