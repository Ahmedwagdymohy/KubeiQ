#!/bin/sh
# Connect a Kubernetes cluster to KubeiQ with read-only access. Run it where kubectl already
# reaches the cluster (your laptop, Cloud Shell, a bastion). Works on any provider.
#
#   curl -fsSL https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/connect.sh \
#     | sh -s -- --name prod > kubeiq-prod.yaml
#
# Then add kubeiq-prod.yaml in KubeiQ under Settings, Clusters.
#
# It creates the namespace "kubeiq", a ServiceAccount with the read-only role from
# deploy/rbac/kubeiq-readonly.yaml (no Secrets) and a token for it, and prints a kubeconfig with
# that token. KubeiQ never gets your own credentials.
#
# Options:
#   --name NAME              cluster name in KubeiQ          (default: the context name)
#   --context CONTEXT        kubectl context to use          (default: the current context)
#   --server URL             API server address KubeiQ uses  (default: the one in your kubeconfig)
#   --changes                also allow the changes Cluster Manager offers (scale, restart, ...)
#   --google-identity EMAIL  GKE with Google identity: grant the read-only role to this Google
#                            service account instead of creating a token. Prints nothing to add.
#   --remove                 remove everything this script created
#
# Revoke access at any time:  sh connect.sh --remove   (or delete the namespace "kubeiq")
set -eu

REF="${KUBEIQ_REF:-main}"
RBAC="${KUBEIQ_RBAC:-https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/$REF/deploy/rbac}"
NAMESPACE=kubeiq

say() { printf '\033[36m==>\033[0m %s\n' "$1" >&2; }
fail() { printf '\033[31merror:\033[0m %s\n' "$1" >&2; exit 1; }

main() {
  name="" context="" server="" changes=0 identity="" remove=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --name) name="${2:?--name needs a value}"; shift 2 ;;
      --context) context="${2:?--context needs a value}"; shift 2 ;;
      --server) server="${2:?--server needs a value}"; shift 2 ;;
      --changes) changes=1; shift ;;
      --google-identity) identity="${2:?--google-identity needs an email}"; shift 2 ;;
      --remove) remove=1; shift ;;
      -h | --help) sed -n '2,24p' "$0" 2>/dev/null | sed 's/^# \{0,1\}//' >&2; exit 0 ;;
      *) fail "Unknown option $1 (see --help)" ;;
    esac
  done

  command -v kubectl >/dev/null 2>&1 || fail "kubectl is required: https://kubernetes.io/docs/tasks/tools/"
  [ -n "$context" ] || context=$(kubectl config current-context 2>/dev/null) ||
    fail "No current kubectl context. Connect kubectl to the cluster first, or pass --context"
  k() { kubectl --context "$context" "$@"; }
  k version --request-timeout=10s >/dev/null 2>&1 ||
    fail "kubectl cannot reach the cluster of context $context"

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
  [ -n "$name" ] || name=$(printf '%s' "$context" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9-]/-/g; s/--*/-/g; s/^-//; s/-$//')

  case "$server" in
    *://127.0.0.1* | *://localhost* | *://0.0.0.0*)
      say "Note: $server only works on this machine. If KubeiQ runs elsewhere, pass --server" ;;
  esac

  cat <<EOF
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
  say "Done. Add this kubeconfig in KubeiQ under Settings, Clusters"
}

# bind NAME ROLE EMAIL: a ClusterRoleBinding of ROLE to the Kubernetes user EMAIL
bind() {
  k create clusterrolebinding "$1" --clusterrole "$2" --user "$3" --dry-run=client -o yaml | k apply -f - >&2
}

main "$@"
