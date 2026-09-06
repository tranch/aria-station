#!/usr/bin/env bash
# source .env
if [ -f "$PWD/.env" ]; then
  set -a
  . "$PWD/.env"
  set +a
fi

aria2c \
  --enable-rpc=true \
  --rpc-listen-port=6800 \
  --rpc-listen-all=false \
  --rpc-secret="$ARIA2_RPC_SECRET" \
  --dir="$HOME/downloads" \
  --continue=true \
  --input-file="$PWD/.data/aria2-config/session.txt" \
  --save-session="$PWD/.data/aria2-config/session.txt" \
  --save-session-interval=30 \
  --log="$PWD/.data/aria2.log" \
  --show-console-readout=false \
  --daemon=true
