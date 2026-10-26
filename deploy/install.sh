#!/bin/sh
# KubeiQ installer: one command for the whole platform (every product included).
#
#   curl -fsSL https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/install.sh | sh
#
# Environment overrides:
#   KUBEIQ_DIR      install directory                          (default: ~/kubeiq)
#   KUBEIQ_REF      git branch or tag to install               (default: main)
#   KUBEIQ_PORT     port for the app                           (default: 3000)
#   KUBEIQ_DOMAIN   a domain pointing at this server: serves KubeiQ over HTTPS on 80/443 with an
#                   automatic certificate                      (default: none, plain HTTP)
set -eu

REPO="https://github.com/Ahmedwagdymohy/KubeiQ.git"
DIR="${KUBEIQ_DIR:-$HOME/kubeiq}"
REF="${KUBEIQ_REF:-main}"

say() { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33mnote:\033[0m %s\n' "$1"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }
random() { LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c "$1"; }

# get_var FILE KEY: the value of KEY in an env file (empty when unset)
get_var() { sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -n 1; }

# set_var FILE KEY VALUE: replace KEY in an env file, or append it
set_var() {
  tmp="$1.tmp"
  awk -v k="$2" -v v="$3" 'BEGIN { done = 0 }
    index($0, k "=") == 1 { print k "=" v; done = 1; next }
    { print }
    END { if (!done) print k "=" v }' "$1" >"$tmp"
  mv "$tmp" "$1"
}

# ready DOMAIN PORT: the API answers through the proxy (with a domain, the certificate may still
# be on its way, so check the API and that the proxy is up instead)
ready() {
  if [ -z "$1" ] && command -v curl >/dev/null 2>&1; then
    curl -fsS -o /dev/null "http://localhost:$2/healthz"
  else
    docker compose exec -T backend python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/readyz')" </dev/null >/dev/null 2>&1 &&
      [ "$(docker compose ps --format '{{.State}}' proxy)" = running ]
  fi
}

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
  cd "$DIR"

  # App settings: the master key, the encryption key and the AI model.
  app_env="backend/.env"
  if [ ! -f "$app_env" ]; then
    cp backend/.env.example "$app_env"
    # Encrypts saved AI keys and kubeconfigs. Set once: changing it makes them unreadable.
    set_var "$app_env" KUBEIQ_SECRET_KEY "$(random 48)"
    say "Created $DIR/$app_env (add an AI model there or in Settings)"
  fi
  if [ -z "$(get_var "$app_env" KUBEIQ_MASTER_KEY)" ]; then
    set_var "$app_env" KUBEIQ_MASTER_KEY "kiq-$(random 32)"
    say "Generated a master key"
  fi
  chmod 600 "$app_env"
  master_key=$(get_var "$app_env" KUBEIQ_MASTER_KEY)

  # Deployment settings, read by docker compose: version, port, domain, database password.
  if [ ! -f .env ]; then
    [ -f "$app_env" ] && [ -n "$(docker volume ls -q --filter name=kubeiq-data)" ] &&
      warn "KubeiQ now stores its data in Postgres. Investigations from the earlier version are not carried over."
    printf '# Deployment settings for docker compose. App settings are in backend/.env\n' >.env
    set_var .env POSTGRES_PASSWORD "$(random 32)"
    set_var .env KUBEIQ_PORT 3000
    set_var .env KUBEIQ_DOMAIN ""
  fi
  chmod 600 .env
  # The image tag for this ref, named the way .github/workflows/images.yml publishes it
  set_var .env KUBEIQ_VERSION "$(printf '%s' "$REF" | sed 's/^v\([0-9]\)/\1/; s/[^A-Za-z0-9_.-]/-/g')"
  port="${KUBEIQ_PORT:-${KUBEIQ_FRONTEND_PORT:-}}"
  [ -n "$port" ] && set_var .env KUBEIQ_PORT "$port"
  [ -n "${KUBEIQ_DOMAIN:-}" ] && set_var .env KUBEIQ_DOMAIN "$KUBEIQ_DOMAIN"
  domain=$(get_var .env KUBEIQ_DOMAIN)
  if [ -n "$domain" ]; then
    set_var .env KUBEIQ_PORT 80
    set_var .env KUBEIQ_HTTPS_PORT 443
  fi
  port=$(get_var .env KUBEIQ_PORT)
  # Run the API as this user so it can read ~/.kube/config, which is private to its owner.
  uid=$(id -u)
  gid=$(id -g)
  set_var .env KUBEIQ_UID "$uid"
  set_var .env KUBEIQ_GID "$gid"
  # Created here so Docker does not create it owned by root, which would stop kubectl, kind and
  # minikube from writing their kubeconfig later.
  mkdir -p "$HOME/.kube"

  say "Getting the KubeiQ images"
  docker compose pull --quiet proxy postgres </dev/null
  if ! docker compose pull --quiet backend frontend </dev/null 2>/dev/null; then
    say "No published images for $REF, building them here (the first build takes a few minutes)"
    docker compose build </dev/null
  fi

  # KubeiQ's own state (generated keys) must belong to the user the API runs as.
  docker compose run --rm -T --no-deps --user 0 --entrypoint chown backend -R "$uid:$gid" /data </dev/null

  say "Starting KubeiQ"
  docker compose up --detach --remove-orphans </dev/null

  say "Waiting for KubeiQ to start"
  tries=0
  until ready "$domain" "$port"; do
    tries=$((tries + 1))
    [ "$tries" -ge 60 ] && fail "KubeiQ did not start. See the logs: cd $DIR && docker compose logs backend"
    sleep 2
  done

  if [ -n "$domain" ]; then
    url="https://$domain"
  elif [ "$port" = 80 ]; then
    url="http://localhost"
  else
    url="http://localhost:$port"
  fi

  say "KubeiQ is running: $url"
  [ -z "$domain" ] && echo "    From another machine, use this server's address instead of localhost."
  echo ""
  echo "    Sign in as: admin"
  echo "    Master key: $master_key"
  echo "    Keep this key safe. It is also in $DIR/$app_env (KUBEIQ_MASTER_KEY)."
  echo ""
  echo "    Logs:    cd $DIR && docker compose logs -f"
  echo "    Stop:    cd $DIR && docker compose down"
  echo "    Update:  run this installer again"
}

main "$@"
