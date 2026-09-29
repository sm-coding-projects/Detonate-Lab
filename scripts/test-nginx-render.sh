#!/bin/sh
# Renders the web tier's nginx config in all four BASIC_AUTH × TLS
# combinations and verifies that `nginx -t` accepts each one.
#
# Used by CI (.github/workflows/build.yml). Run locally with
# `./scripts/test-nginx-render.sh` if you have nginx installed.

set -eu

cd "$(dirname "$0")/.."

# Prefer the local nginx binary; fall back to docker. Both work but the
# local one is faster and doesn't need Docker-in-Docker.
if command -v nginx >/dev/null 2>&1; then
  validate() {
    nginx -p "$tmp/" -c "$tmp/etc/nginx/nginx.test.conf" -t 2>&1
  }
elif command -v docker >/dev/null 2>&1; then
  validate() {
    docker run --rm \
      -v "$tmp:/etc/nginx" \
      nginxinc/nginx-unprivileged:1.27-alpine \
      sh -c 'nginx -t' 2>&1
  }
else
  echo "neither nginx nor docker found — skipping" >&2
  exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/etc/nginx/conf.d" "$tmp/etc/nginx/secrets" "$tmp/usr/share/nginx/html" "$tmp/logs" "$tmp/run"

# Wrapper config — provides the events block our template omits. The real
# nginx.conf template is rendered into conf.d/default.conf and pulled in
# via `include`. This is the same trick the stock nginx image uses (it has
# /etc/nginx/nginx.conf + include /etc/nginx/conf.d/*.conf).
cat > "$tmp/etc/nginx/nginx.test.conf" <<'EOF'
worker_processes 1;
pid /tmp/nginx.pid;
http {
    include /etc/nginx/conf.d/*.conf;
}
events { worker_connections 1024; }
EOF

# Copy the template, TLS snippet, and the security headers.
cp frontend/nginx.conf.template  "$tmp/nginx.conf.template"
cp frontend/nginx.tls.conf        "$tmp/etc/nginx/conf.d/active-tls.conf"
cp frontend/nginx.basic-auth.conf "$tmp/etc/nginx/conf.d/active-basic-auth.conf"
cp frontend/security-headers.conf "$tmp/etc/nginx/security-headers.conf"
echo "<html>ok</html>" > "$tmp/usr/share/nginx/html/index.html"

# Bogus htpasswd entry — `user:pass`. nginx only reads this file when the
# rendered config enables auth_basic + points user_file at it.
echo "detonate:\$apr1\$HIpR6QHN\$pGjY2Pz9kf1U5p5D3LpcH0" > "$tmp/etc/nginx/secrets/web_basic_auth_htpasswd"

# Self-signed TLS cert (also bogus — nginx -t doesn't care).
openssl req -x509 -newkey rsa:2048 -days 1 -nodes \
  -keyout "$tmp/etc/nginx/secrets/web_tls_key.pem" \
  -out    "$tmp/etc/nginx/secrets/web_tls_cert.pem" \
  -subj "/CN=localhost" 2>/dev/null

render() {
  basic_auth_auth="$1"
  basic_auth_user_file="$2"
  tls_listener="$3"

  sed \
    -e "s|__BASIC_AUTH_AUTH__|${basic_auth_auth}|" \
    -e "s|__BASIC_AUTH_USER_FILE__|${basic_auth_user_file}|" \
    -e "s|__TLS_LISTENER__|${tls_listener}|" \
    "$tmp/nginx.conf.template" > "$tmp/etc/nginx/conf.d/default.conf"
}

# Four combinations (auth off/on, tls off/on):
#   1. lab default — open, plain http
#   2. auth — lab with basic auth, plain http
#   3. tls — open, https only (self-signed cert)
#   4. auth+tls — production-style
combos=(
  ""                                                          ""                                                          ""
  'auth_basic "Detonate Lab";'                                'auth_basic_user_file /etc/nginx/secrets/web_basic_auth_htpasswd;' ""
  ""                                                          ""                                                          'include /etc/nginx/conf.d/active-tls.conf;'
  'auth_basic "Detonate Lab";'                                'auth_basic_user_file /etc/nginx/secrets/web_basic_auth_htpasswd;' 'include /etc/nginx/conf.d/active-tls.conf;'
)

ok=0
failed=0
i=0
n=0
while [ "$i" -lt "${#combos[@]}" ]; do
  n=$((n + 1))
  auth_a="${combos[$i]}"; i=$((i + 1))
  auth_b="${combos[$i]}"; i=$((i + 1))
  tls="${combos[$i]}";   i=$((i + 1))

  render "$auth_a" "$auth_b" "$tls"

  if validate >/dev/null 2>&1; then
    echo "[combo $n] OK"
    ok=$((ok + 1))
  else
    echo "[combo $n] FAIL"
    validate 2>&1 | sed "s|^|[combo $n]   |"
    failed=$((failed + 1))
  fi
done

echo "summary: ${ok} passed, ${failed} failed (of ${n})"

if [ "$failed" -gt 0 ]; then
  exit 1
fi