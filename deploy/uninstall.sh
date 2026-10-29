#!/bin/sh
# KubeiQ uninstaller: removes what install.sh set up, and nothing else.
#
#   curl -fsSL https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/uninstall.sh | sh
#
# Removes KubeiQ's containers, its Docker network and volumes (the database and generated keys),
# its own images (kubeiq-backend, kubeiq-frontend) and the install directory with its settings.
# Keeps everything else: the shared postgres and caddy images other software may use, your
# ~/.kube, and your clusters. The read-only access connect.sh created in a cluster is removed per
# cluster with: connect.sh --remove --context <context>
#
# Options:
#   --yes        do not ask for confirmation
#   --keep-data  keep the database, keys and settings (Docker volumes and the install directory):
#                running install.sh again brings KubeiQ back as it was
#   --dry-run    only print what would be removed
#
# Environment overrides:
#   KUBEIQ_DIR   install directory (default: ~/kubeiq)
set -eu

DIR="${KUBEIQ_DIR:-$HOME/kubeiq}"
CONNECT="https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/connect.sh"

say() { printf '\033[36m==>\033[0m %s\n' "$1"; }
warn() { printf '\033[33mnote:\033[0m %s\n' "$1"; }
fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

# run CMD...: run it, or only show it with --dry-run. quiet: the same, without its output.
run() {
  if [ "$dry" = 1 ]; then printf '    %s\n' "$*"; else "$@"; fi
}
quiet() {
  if [ "$dry" = 1 ]; then printf '    %s\n' "$*"; else "$@" >/dev/null; fi
}

# Everything runs inside main, called on the last line: with `curl | sh` the shell reads the
# script from stdin, so it must be fully parsed before any command that could read stdin runs.
main() {
  yes=0 keep=0 dry=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --yes | -y) yes=1; shift ;;
      --keep-data) keep=1; shift ;;
      --dry-run) dry=1; shift ;;
      -h | --help) sed -n '2,20p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//'; exit 0 ;;
      *) fail "Unknown option $1 (see --help)" ;;
    esac
  done

  command -v docker >/dev/null 2>&1 || fail "Docker is not installed, so there is nothing of KubeiQ's to remove in it"
  docker info >/dev/null 2>&1 || fail "Docker is not running. Start it and run this again."

  # Compose names the project after the install directory ("kubeiq" by default).
  project=$(basename "$DIR" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')
  installed=0
  if [ -f "$DIR/docker-compose.yml" ] && grep -q 'kubeiq-backend' "$DIR/docker-compose.yml" &&
    [ -f "$DIR/deploy/install.sh" ]; then
    installed=1
  elif [ -e "$DIR" ]; then
    fail "$DIR is not a KubeiQ install, so it is left alone. Set KUBEIQ_DIR to the right directory."
  fi

  containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
  volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project")
  networks=$(docker network ls -q --filter "label=com.docker.compose.project=$project")
  # Only the KubeiQ images this install uses, never other copies or the shared base images.
  # shellcheck disable=SC2086 # one argument per container id
  images=$( {
    [ -n "$containers" ] && docker inspect -f '{{.Config.Image}}' $containers 2>/dev/null
    [ "$installed" = 1 ] && (cd "$DIR" && docker compose config --images 2>/dev/null </dev/null)
  } | grep -E '(^|/)kubeiq-(backend|frontend)(:|$)' | sort -u || true)

  if [ "$installed" = 0 ] && [ -z "$containers$volumes$networks$images" ]; then
    say "KubeiQ is not installed here (nothing found for $DIR). Nothing to do"
    exit 0
  fi

  say "This removes KubeiQ:"
  if [ "$installed" = 1 ]; then
    if [ "$keep" = 1 ]; then echo "    - (keeping $DIR with its settings and keys: --keep-data)"
    else echo "    - $DIR (the app, its settings and master key)"
    fi
  fi
  [ -n "$containers" ] && echo "    - its containers ($(count "$containers"))"
  [ -n "$networks" ] && echo "    - its Docker network"
  if [ -n "$volumes" ]; then
    if [ "$keep" = 1 ]; then echo "    - (keeping its data volumes: --keep-data)"
    else echo "    - its data: the database and generated keys ($(count "$volumes") volumes)"
    fi
  fi
  [ -n "$images" ] && echo "    - its images ($(count "$images"))"
  echo "    It keeps the shared postgres and caddy images, your ~/.kube and your clusters."

  if [ "$yes" = 0 ] && [ "$dry" = 0 ]; then
    [ -r /dev/tty ] || fail "Cannot ask for confirmation here. Run it again with --yes"
    printf 'Remove KubeiQ? [y/N] '
    read -r answer </dev/tty || answer=""
    case "$answer" in y | Y | yes | YES) ;; *) say "Nothing removed"; exit 0 ;; esac
  fi
  [ "$dry" = 1 ] && say "Dry run. These commands would run:"

  if [ "$installed" = 1 ]; then
    if [ "$keep" = 1 ]; then
      (cd "$DIR" && run docker compose down --remove-orphans </dev/null)
    else
      (cd "$DIR" && run docker compose down --volumes --remove-orphans </dev/null)
    fi
  fi
  # Anything compose did not know about (an install directory already deleted by hand).
  # shellcheck disable=SC2086 # one argument per id
  {
    containers=$(docker ps -aq --filter "label=com.docker.compose.project=$project")
    [ -n "$containers" ] && quiet docker rm -f $containers
    networks=$(docker network ls -q --filter "label=com.docker.compose.project=$project")
    [ -n "$networks" ] && quiet docker network rm $networks
    if [ "$keep" = 0 ]; then
      volumes=$(docker volume ls -q --filter "label=com.docker.compose.project=$project")
      [ -n "$volumes" ] && quiet docker volume rm $volumes
    fi
    [ -n "$images" ] && quiet docker rmi $images
  } || true

  if [ "$installed" = 1 ] && [ "$keep" = 0 ]; then
    run rm -rf "$DIR"
  fi

  [ "$dry" = 1 ] && exit 0
  say "KubeiQ is removed"
  [ "$keep" = 1 ] && warn "Its data and settings are kept in $DIR and Docker volumes. Run the installer to bring it back."
  echo
  echo "    KubeiQ's read-only access stays in the clusters you connected. To remove it from one:"
  echo "    curl -fsSL $CONNECT | sh -s -- --remove --context <context>"
}

count() { printf '%s\n' "$1" | grep -c .; }

main "$@"
