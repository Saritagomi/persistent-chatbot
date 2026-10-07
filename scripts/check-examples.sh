#!/usr/bin/env bash
# Builds every example against the packed tarball (what npm users get), in a temp dir.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
npm run build --prefix "$root" >/dev/null
(cd "$root" && npm pack --pack-destination "$tmp" >/dev/null 2>&1)
tarball="$(ls "$tmp"/*.tgz)"

for ex in express vite-react nextjs; do
  echo "== $ex"
  cp -R "$root/examples/$ex" "$tmp/$ex"
  cd "$tmp/$ex"
  # Swap the registry version for the local tarball before installing.
  node -e 'const f="package.json",p=require("./"+f);p.dependencies["@saritagomi/persistent-chatbot"]=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(p))' "$tarball"
  npm install --no-audit --no-fund --loglevel=error >/dev/null
  case $ex in
    express)
      PORT=3999 node server.js & pid=$!
      sleep 1
      out="$(curl -sN -X POST localhost:3999/api/chat -H 'content-type: application/json' \
        -d '{"messages":[{"role":"user","content":"hi"}]}')"
      kill $pid
      grep -q '"t":"x"' <<<"$out" || { echo "express: no done event"; echo "$out"; exit 1; }
      ;;
    vite-react) npx vite build --logLevel warn ;;
    nextjs) NEXT_TELEMETRY_DISABLED=1 npx next build >/dev/null ;;
  esac
  echo "   ok"
done
