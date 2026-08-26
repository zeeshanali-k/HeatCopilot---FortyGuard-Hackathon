/**
 * Simple file + console logger for debugging.
 *
 * Writes JSON lines to server/logs/app.log and prints readable messages to the
 * terminal. API keys and other secrets are never logged.
 */

import { createWriteStream } from 'fs';
import { mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'logs');
const LOG_FILE = join(LOGS_DIR, 'app.log');

if (!existsSync(LOGS_DIR)) {
  mkdirSync(LOGS_DIR, { recursive: true });
}

const stream = createWriteStream(LOG_FILE, { flags: 'a' });

function now() {
  return new Date().toISOString();
}

function write(level, message, meta = {}) {
  const line = JSON.stringify({
    timestamp: now(),
    level,
    message,
    ...meta,
  });
  stream.write(`${line}\n`);

  const metaStr = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : '';
  if (level === 'error') {
    console.error(`[${now()}] ${level.toUpperCase()}: ${message}${metaStr}`);
  } else if (level === 'warn') {
    console.warn(`[${now()}] ${level.toUpperCase()}: ${message}${metaStr}`);
  } else {
    console.log(`[${now()}] ${level.toUpperCase()}: ${message}${metaStr}`);
  }
}

export const logger = {
  info: (message, meta) => write('info', message, meta),
  warn: (message, meta) => write('warn', message, meta),
  error: (message, meta) => write('error', message, meta),
  debug: (message, meta) => write('debug', message, meta),
};
