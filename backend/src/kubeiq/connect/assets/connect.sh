#!/bin/sh
# Connect a Kubernetes cluster to KubeiQ with read-only access. Run it where kubectl already
# reaches the cluster (your laptop, Cloud Shell, a bastion, the KubeiQ server). Any provider.
#
# The easy way: KubeiQ shows this command with a one-time code under Settings, Clusters, Add.
# The cluster then appears in KubeiQ by itself:
#
#   curl -fsSL https://<your KubeiQ>/api/v1/connect.sh | sh -s -- --code <code>
#
# Without a code it prints a kubeconfig, to add in KubeiQ under Settings, Clusters:
#
#   curl -fsSL https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/connect.sh \
#     | sh -s -- --name prod > kubeiq-prod.yaml
#
# It creates the namespace "kubeiq", a ServiceAccount with the read-only role from
# deploy/rbac/kubeiq-readonly.yaml (no Secrets) and a token for it. KubeiQ never gets your own
# credentials.
#
# Options:
#   --code CODE              one-time code from KubeiQ: hand the access to KubeiQ directly
#   --name NAME              cluster name in KubeiQ          (default: the context name)
#   --context CONTEXT        kubectl context to use          (default: the current context)
#   --server URL             API server address KubeiQ uses  (default: the one in your kubeconfig)
#   --changes                also allow the changes Cluster Manager offers (scale, restart, ...)
#   --google-identity EMAIL  GKE with Google identity: grant the read-only role to this Google
#                            service account instead of creating a token. Nothing to add.
#   --kubeiq URL             KubeiQ's address, for --code     (default: where this script came from)
#   --remove                 remove everything this script created
#
# Revoke access at any time:  sh connect.sh --remove   (or delete the namespace "kubeiq")
set -eu

# KubeiQ fills in its own address when it serves this script.
KUBEIQ_URL="${KUBEIQ_URL:-}"
REF="${KUBEIQ_REF:-main}"
NAMESPACE=kubeiq

say() { printf '\033[36m==>\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

main() {
  name="" context="" server="" changes=0 identity="" remove=0 code=""
  while [ $# -gt 0 ]; do
    case "$1" in
      --code) code="${2:?--code needs a value}"; shift 2 ;;
      --name) name="${2:?--name needs a value}"; shift 2 ;;
      --context) context="${2:?--context needs a value}"; shift 2 ;;
      --server) server="${2:?--server needs a value}"; shift 2 ;;
      --changes) changes=1; shift ;;
      --google-identity) identity="${2:?--google-identity needs an email}"; shift 2 ;;
      --kubeiq) KUBEIQ_URL="${2:?--kubeiq needs a URL}"; shift 2 ;;
      --remove) remove=1; shift ;;
      -h | --help) sed -n '2,30p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' >&2; exit 0 ;;
      *) fail "Unknown option $1 (see --help)" ;;
    esac
  done
  KUBEIQ_URL="${KUBEIQ_URL%/}"
  if [ -n "${KUBEIQ_RBAC:-}" ]; then RBAC="$KUBEIQ_RBAC"
  elif [ -n "$KUBEIQ_URL" ]; then RBAC="$KUBEIQ_URL/api/v1/connect/rbac"
  else RBAC="https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/$REF/deploy/rbac"
  fi

  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"' EXIT

  if [ -n "$code" ]; then
    [ -n "$KUBEIQ_URL" ] || fail "--code needs KubeiQ's address. Copy the command from KubeiQ, or add --kubeiq <url>"
    # Before touching the cluster: is the code still good?
    status=$(api GET /api/v1/connect/check) || fail "Cannot reach KubeiQ at $KUBEIQ_URL"
    [ "$status" = 200 ] || fail "$(cat "$tmp/reply")"
  fi

  command -v kubectl >/dev/null 2>&1 || fail "kubectl is required: https://kubernetes.io/docs/tasks/tools/"
  [ -n "$context" ] || context=$(kubectl config current-context 2>/dev/null) ||
    fail "No current kubectl context. Connect kubectl to the cluster first, or pass --context"
  k() { kubectl --context "$context" "$@"; }
  k version --request-timeout=10s >/dev/null 2>&1 ||
    fail "kubectl cannot reach the cluster of context $context. Check kubectl config get-contexts"

  if [ "$remove" = 1 ]; then
    say "Removing KubeiQ access from $context"
    k delete clusterrolebinding kubeiq-readonly kubeiq-changes kubeiq-readonly-google kubeiq-changes-google --ignore-not-found >&2
    k delete clusterrole kubeiq-readonly kubeiq-changes --ignore-not-found >&2
    k delete namespace "$NAMESPACE" --ignore-not-found >&2
    say "Done. KubeiQ can no longer read this cluster"
    exit 0
  fi

  say "Granting KubeiQ read-only access on $context"
  k create namespace "$NAMESPACE" --dry-run=client -o yaml | k apply -f - >&2
  k apply -f "$RBAC/kubeiq-readonly.yaml" >&2
  [ "$changes" = 1 ] && k apply -f "$RBAC/kubeiq-changes.yaml" >&2

  if [ -n "$identity" ]; then
    # GKE maps a Google service account to a Kubernetes user named by its email.
    bind kubeiq-readonly-google kubeiq-readonly "$identity"
    [ "$changes" = 1 ] && bind kubeiq-changes-google kubeiq-changes "$identity"
    say "Done. $identity can now read this cluster. Nothing else to add in KubeiQ"
    exit 0
  fi

  say "Creating a token for the KubeiQ service account"
  k apply -f - >&2 <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: kubeiq-token
  namespace: $NAMESPACE
  annotations:
    kubernetes.io/service-account.name: kubeiq
type: kubernetes.io/service-account-token
EOF
  token="" tries=0
  until [ -n "$token" ]; do
    token=$(k get secret kubeiq-token -n "$NAMESPACE" -o jsonpath='{.data.token}' 2>/dev/null || true)
    tries=$((tries + 1))
    [ -n "$token" ] || { [ "$tries" -ge 30 ] && fail "The token was not issued. Is the token controller running?"; sleep 1; }
  done
  token=$(printf '%s' "$token" | base64 -d)

  view() { k config view --minify --raw -o "jsonpath={$1}"; }
  [ -n "$server" ] || server=$(view '.clusters[0].cluster.server')
  # The CA from your kubeconfig verifies the address you use; the token's CA is the fallback.
  ca=$(view '.clusters[0].cluster.certificate-authority-data')
  [ -n "$ca" ] || ca=$(k get secret kubeiq-token -n "$NAMESPACE" -o jsonpath='{.data.ca\.crt}')
  # Lowercase letters, numbers and dashes, as KubeiQ names clusters.
  name=$(printf '%s' "${name:-$context}" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g; s/--*/-/g; s/^-//; s/-$//' | cut -c 1-40)

  cat >"$tmp/kubeconfig" <<EOF
apiVersion: v1
kind: Config
clusters:
  - name: $name
    cluster:
      server: $server
      certificate-authority-data: $ca
users:
  - name: kubeiq
    user:
      token: $token
contexts:
  - name: $name
    context:
      cluster: $name
      user: kubeiq
current-context: $name
EOF

  if [ -z "$code" ]; then
    case "$server" in
      *://127.0.0.1* | *://localhost* | *://0.0.0.0*)
        say "Note: $server only works on this machine. If KubeiQ runs elsewhere, pass --server" ;;
    esac
    cat "$tmp/kubeconfig"
    say "Done. Add this kubeconfig in KubeiQ under Settings, Clusters"
    exit 0
  fi

  say "Handing the access to KubeiQ"
  status=$(send) || fail "Cannot reach KubeiQ at $KUBEIQ_URL"
  if [ "$status" = 409 ] && link_networks; then
    say "Checking again"
    status=$(send) || fail "Cannot reach KubeiQ at $KUBEIQ_URL"
  fi
  [ "$status" = 200 ] || fail "$(cat "$tmp/reply")"
  say "$(cat "$tmp/reply")"
}

# api METHOD PATH: call KubeiQ with the code; prints the HTTP status, the reply goes to $tmp/reply
api() {
  curl -sS -o "$tmp/reply" -w '%{http_code}' -X "$1" -H "Authorization: Bearer $code" "$KUBEIQ_URL$2"
}

# send: hand the kubeconfig to KubeiQ, which saves it only once it can reach the cluster
send() {
  curl -sS -o "$tmp/reply" -w '%{http_code}' -X POST -H "Authorization: Bearer $code" \
    -H "Content-Type: application/yaml" --data-binary "@$tmp/kubeconfig" \
    "$KUBEIQ_URL/api/v1/connect?name=$name"
}

# link_networks: KubeiQ cannot reach the cluster. When both run in Docker on this machine (minikube,
# kind), put KubeiQ on the cluster's network and remember it, so the installer keeps the link.
link_networks() {
  host=$(printf '%s' "$server" | sed 's#^[a-z]*://##; s#[:/].*$##')
  command -v docker >/dev/null 2>&1 || return 1
  backend=$(docker ps -q --filter label=io.kubeiq.service=backend 2>/dev/null | head -n 1)
  [ -n "$backend" ] || backend=$(docker ps -q --filter label=com.docker.compose.project=kubeiq --filter label=com.docker.compose.service=backend 2>/dev/null | head -n 1)
  [ -n "$backend" ] || return 1
  ids=$(docker ps -q)
  # shellcheck disable=SC2086 # one argument per container id
  # The container that answers at the server's address (its IP or its name) and its network.
  network=$(docker inspect -f '{{range $n, $e := .NetworkSettings.Networks}}{{$n}} {{$e.IPAddress}} {{$.Name}}{{"\n"}}{{end}}' $ids 2>/dev/null |
    awk -v host="$host" '$2 == host || $3 == "/" host { print $1; exit }')
  if [ -z "$network" ]; then
    printf '%s\n' "KubeiQ cannot reach $server. Run this where KubeiQ can reach the cluster, or pass --server with an address it can reach" >>"$tmp/reply"
    return 1
  fi
  say "Linking KubeiQ to the Docker network $network, where the cluster runs"
  if ! out=$(docker network connect "$network" "$backend" 2>&1); then
    case "$out" in
      *"already exists"*) ;;
      *) fail "Could not link the networks: $out. Run: docker network connect $network $backend" ;;
    esac
  fi
  remember_network "$network"
}

# remember_network NAME: add NAME to KUBEIQ_NETWORKS in KubeiQ's .env, read by the installer
remember_network() {
  dir=$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' "$backend" 2>/dev/null || true)
  env="$dir/.env"
  if [ -z "$dir" ] || [ ! -w "$env" ]; then return 0; fi
  current=$(sed -n 's/^KUBEIQ_NETWORKS=//p' "$env" | tail -n 1)
  case " $current " in *" $1 "*) return 0 ;; esac
  grep -v '^KUBEIQ_NETWORKS=' "$env" >"$tmp/env" || true
  printf 'KUBEIQ_NETWORKS=%s\n' "$(printf '%s %s' "$current" "$1" | sed 's/^ *//')" >>"$tmp/env"
  cat "$tmp/env" >"$env"
}

# bind NAME ROLE EMAIL: a ClusterRoleBinding of ROLE to the Kubernetes user EMAIL
bind() {
  k create clusterrolebinding "$1" --clusterrole "$2" --user "$3" --dry-run=client -o yaml | k apply -f - >&2
}

main "$@"
