#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

for command in python3 npx lsof setsid; do
  command -v "$command" >/dev/null || { echo "Missing command: $command" >&2; exit 1; }
done

mkdir -p .dev
own_group=$(ps -o pgid= -p "$$" | tr -d ' ')

listeners() {
  lsof -tiTCP:"$1" -sTCP:LISTEN || true
}

restart() {
  local name=$1 port=$2 pid group leader
  shift 2

  for pid in $(listeners "$port"); do
    group=$(ps -o pgid= -p "$pid" | tr -d ' ')
    leader=$(ps -o args= -p "${group:-$pid}" || true)
    # Stop the whole server job, including Wrangler's child processes.
    if [[ -n "$group" && "$group" != "$own_group" &&
          ( "$leader" == *wrangler* || "$leader" == *"-m http.server"* ) ]]; then
      kill -TERM -- "-$group" 2>/dev/null || true
    else
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  for ((attempt = 0; attempt < 50; attempt++)); do
    [[ -z "$(listeners "$port")" ]] && break
    sleep 0.1
  done
  if [[ -n "$(listeners "$port")" ]]; then
    echo "$name: could not free port $port" >&2
    exit 1
  fi

  nohup setsid "$@" >".dev/$name.log" 2>&1 < /dev/null &
  pid=$!
  for ((attempt = 0; attempt < 120; attempt++)); do
    if ! kill -0 "$pid" 2>/dev/null; then
      echo "$name failed to start. See .dev/$name.log" >&2
      exit 1
    fi
    if [[ -n "$(listeners "$port")" ]]; then
      echo "$name: http://localhost:$port"
      return
    fi
    sleep 0.5
  done
  kill -TERM -- "-$pid" 2>/dev/null || true
  echo "$name timed out starting. See .dev/$name.log" >&2
  exit 1
}

restart frontend 8000 python3 -m http.server 8000
restart ligainsider 8787 npx --yes wrangler dev --config wrangler.toml --port 8787 --inspector-port 9230
restart kickbase 8788 npx --yes wrangler dev --config wrangler.kickbase.toml --port 8788 --inspector-port 9231

echo "Running in the background. Logs: .dev/*.log"
