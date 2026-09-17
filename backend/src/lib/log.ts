/**
 * Minimal structured logger. Emits one JSON line per call to stdout/stderr so
 * the whole stream stays machine-parseable. Each line carries a module tag (in
 * lieu of a fancy logger framework), a timestamp, the level, the message and
 * any extra context the caller passed.
 *
 * Errors and warnings go to stderr; info-level breadcrumbs go to stdout.
 * Nothing here imports third-party deps — keeps the deployable small.
 */

type Level = 'info' | 'warn' | 'error';

function emit(level: Level, module: string, msg: string, extra?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    module,
    msg,
    ...(extra ?? {}),
  });
  if (level === 'info') process.stdout.write(line + '\n');
  else process.stderr.write(line + '\n');
}

export const logger = {
  info(module: string, msg: string, extra?: Record<string, unknown>): void {
    emit('info', module, msg, extra);
  },
  warn(module: string, msg: string, extra?: Record<string, unknown>): void {
    emit('warn', module, msg, extra);
  },
  error(module: string, msg: string, extra?: Record<string, unknown>): void {
    emit('error', module, msg, extra);
  },
};
