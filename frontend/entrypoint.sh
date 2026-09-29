#!/bin/sh
# Web tier entrypoint. Renders the runtime nginx config from the template
# by substituting the __BASIC_AUTH_AUTH__, __BASIC_AUTH_USER_FILE__ and
# __TLS_LISTENER__ placeholders, then execs nginx in the foreground.
#
# nginx-unprivileged runs as the `nginx` user (uid 101). We do all our
# setup as root (the Dockerfile USERs root for the COPY stage) then exec
# the nginx master as nginx.

set -eu

CONF_DIR=/etc/nginx/conf.d
SECRETS=/etc/nginx/secrets

mkdir -p "$CONF_DIR" "$SECRETS"

# -- BasicAuth ---------------------------------------------------------------
# Compose mounts the htpasswd secret at
# /etc/nginx/secrets/web_basic_auth_htpasswd when BASIC_AUTH=1. Substitute
# the `auth_basic` directive into the template when present; otherwise
# strip the directive entirely so the app stays open (lab-first UX).
if [ -e "$SECRETS/web_basic_auth_htpasswd" ] && [ -s "$SECRETS/web_basic_auth_htpasswd" ]; then
  BASIC_AUTH_AUTH='auth_basic "Detonate Lab";'
  BASIC_AUTH_USER_FILE='auth_basic_user_file /etc/nginx/secrets/web_basic_auth_htpasswd;'
else
  BASIC_AUTH_AUTH=''
  BASIC_AUTH_USER_FILE=''
fi

# -- TLS ---------------------------------------------------------------------
# Same pattern: cert + key mounted by compose when TLS=1.
if [ -e "$SECRETS/web_tls_cert.pem" ] && [ -e "$SECRETS/web_tls_key.pem" ]; then
  # Copy the pre-rendered listener into place so the runtime config can
  # include it. Content comes from frontend/nginx.tls.conf at build time.
  cp /etc/nginx/nginx.tls.conf "$CONF_DIR/active-tls.conf"
  TLS_LISTENER='include /etc/nginx/conf.d/active-tls.conf;'
else
  TLS_LISTENER=''
fi

# -- Render config -----------------------------------------------------------
# Use sed with `|` as the delimiter so the cert paths (containing `/`)
# don't need escaping.
sed \
  -e "s|__BASIC_AUTH_AUTH__|${BASIC_AUTH_AUTH}|" \
  -e "s|__BASIC_AUTH_USER_FILE__|${BASIC_AUTH_USER_FILE}|" \
  -e "s|__TLS_LISTENER__|${TLS_LISTENER}|" \
  /etc/nginx/nginx.conf.template > "$CONF_DIR/default.conf"

# Sanity check the rendered config before exec'ing nginx.
nginx -t

exec nginx -g 'daemon off;'