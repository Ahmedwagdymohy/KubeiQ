#!/bin/sh
# KubeiQ installer: one command for the whole platform (every product included).
#
#   curl -fsSL https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/install.sh | sh
#
# Environment overrides:
#   KUBEIQ_DIR             install directory            (default: ~/kubeiq)
#   KUBEIQ_REF             git branch or tag to install (default: main)
#   KUBEIQ_FRONTEND_PORT   app port                     (default: 3000)
#   KUBEIQ_BACKEND_PORT    API port                     (default: 8000)
set -eu

REPO="https://github.com/Ahmedwagdymohy/KubeiQ.git"
DIR="${KUBEIQ_DIR:-$HOME/kubeiq}"
REF="${KUBEIQ_REF:-main}"
FRONTEND_PORT="${KUBEIQ_FRONTEND_PORT:-3000}"

say() { printf '\033[36m==>\033[0m %s\n' "$1"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# Everything runs inside main, called on the last line: with `curl | sh` the shell reads the
# script from stdin, so it must be fully parsed before any command that could read stdin runs.
main() {
  command -v git >/dev/null 2>&1 || fail "git is required: https://git-scm.com/downloads"
  command -v docker >/dev/null 2>&1 || fail "Docker is required: https://docs.docker.com/get-docker/"
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (docker compose)"
  docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker and run this again."

  if [ -d "$DIR/.git" ]; then
    say "Updating KubeiQ in $DIR"
    git -C "$DIR" fetch --quiet --depth 1 origin "$REF"
    git -C "$DIR" checkout --quiet FETCH_HEAD
  else
    [ -e "$DIR" ] && fail "$DIR exists and is not a KubeiQ install. Set KUBEIQ_DIR to another path."
    say "Downloading KubeiQ into $DIR"
    git clone --quiet --depth 1 --branch "$REF" "$REPO" "$DIR"
  fi

  if [ ! -f "$DIR/backend/.env" ]; then
    cp "$DIR/backend/.env.example" "$DIR/backend/.env"
    say "Created $DIR/backend/.env (add an AI model there to enable AI investigations)"
  fi

  # The admin signs in with this key. Generated once and kept across updates.
  if ! grep -q '^KUBEIQ_MASTER_KEY=.' "$DIR/backend/.env"; then
    key="kiq-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"
    printf '\nKUBEIQ_MASTER_KEY=%s\n' "$key" >>"$DIR/backend/.env"
    say "Generated a master key in $DIR/backend/.env"
  fi
  master_key=$(sed -n 's/^KUBEIQ_MASTER_KEY=//p' "$DIR/backend/.env" | tail -n 1)

  say "Building and starting KubeiQ (the first run takes a few minutes)"
  cd "$DIR"
  docker compose up --build --detach </dev/null

  say "Waiting for KubeiQ to start"
  tries=0
  until docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/healthz')" </dev/null >/dev/null 2>&1; do
    tries=$((tries + 1))
    [ "$tries" -ge 30 ] && fail "KubeiQ did not start. See the logs: cd $DIR && docker compose logs backend"
    sleep 2
  done

  say "KubeiQ is running: http://localhost:$FRONTEND_PORT"
  echo ""
  echo "    Sign in as: admin"
  echo "    Master key: $master_key"
  echo "    Keep this key safe. It is also in $DIR/backend/.env (KUBEIQ_MASTER_KEY)."
  echo ""
  echo "    Stop:    cd $DIR && docker compose down"
  echo "    Update:  run this installer again"
}

main "$@"
