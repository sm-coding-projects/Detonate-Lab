"""Gunicorn configuration for the Detonate Lab API.

Uvicorn workers give async concurrency. Job state lives in the database, so any
number of workers can serve the polling endpoint regardless of which worker is
running a given analysis task.
"""
import os

bind = f"0.0.0.0:{os.getenv('PORT', '8000')}"
workers = int(os.getenv("WEB_CONCURRENCY", "2"))
worker_class = "uvicorn.workers.UvicornWorker"
timeout = 120
graceful_timeout = 30
keepalive = 5
max_requests = 1000
max_requests_jitter = 100
accesslog = "-"
errorlog = "-"
loglevel = os.getenv("LOG_LEVEL", "info")
# The backend is only reachable through the nginx edge, which OVERWRITES
# X-Forwarded-For with the real peer IP (proxy_set_header X-Forwarded-For
# $remote_addr) — so a client cannot spoof the forwarded IP used by the login
# throttle, even though "*" trusts the immediate (nginx) hop. Gunicorn only
# accepts plain IPs or "*" here (no CIDR); override with specific proxy IPs if
# you front this with a different ingress. The nginx limit_req brute-force
# control keys on the true TCP peer and is unaffected regardless.
forwarded_allow_ips = os.getenv("FORWARDED_ALLOW_IPS", "*")
