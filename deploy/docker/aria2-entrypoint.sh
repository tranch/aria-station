#!/bin/sh
set -eu

: "${ARIA2_RPC_SECRET:?ARIA2_RPC_SECRET must be configured}"
case "$ARIA2_RPC_SECRET" in
  REPLACE_WITH_*|replace-with-*)
    echo "Replace the ARIA2_RPC_SECRET template value before deployment" >&2
    exit 1
    ;;
esac
case "$ARIA2_RPC_SECRET" in
  *[!A-Za-z0-9_-]*|'')
    echo "ARIA2_RPC_SECRET must use only letters, digits, underscore, or hyphen" >&2
    exit 1
    ;;
esac
if [ "${#ARIA2_RPC_SECRET}" -lt 32 ]; then
  echo "ARIA2_RPC_SECRET must contain at least 32 characters" >&2
  exit 1
fi

if [ ! -w /config ]; then
  echo "aria2 cannot write /config; grant the container UID/GID access to the config dataset" >&2
  exit 1
fi
if [ ! -w /downloads ]; then
  echo "aria2 cannot write /downloads; grant the container UID/GID access to the downloads dataset" >&2
  exit 1
fi

umask 077
touch /config/aria2.session
config_file="$(mktemp /tmp/aria2.XXXXXX)"
trap 'rm -f "$config_file"' EXIT HUP INT TERM
cat > "$config_file" <<EOF
enable-rpc=true
rpc-listen-all=true
rpc-listen-port=6800
rpc-secret=$ARIA2_RPC_SECRET
rpc-allow-origin-all=false
listen-port=51413
dht-listen-port=51413
dir=/downloads
input-file=/config/aria2.session
save-session=/config/aria2.session
save-session-interval=60
continue=true
enable-dht=true
bt-save-metadata=true
check-integrity=true
EOF

exec aria2c --conf-path="$config_file" --console-log-level=warn --enable-color=false
