import fs from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import { config } from '@/config/env';

const isDebug = process.env.DEBUG_LOGS === 'true' || config.nodeEnv === 'development';
const logDir = path.resolve(process.cwd(), 'logs');
const logFile = path.join(logDir, 'app.log');

const ensureLogFile = () => {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '');
  }
};

const formatArgs = (args: any[]): string => {
  return args
    .map((arg) => {
      if (arg instanceof Error) {
        return arg.stack || arg.message;
      }
      if (typeof arg === 'string') {
        return arg;
      }
      return inspect(arg, { depth: null, colors: false });
    })
    .join(' ');
};

const istFormatter = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kolkata',
  hour12: true,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

const formatTimestamp = () => {
  const parts = istFormatter.formatToParts(new Date());
  const store: Record<string, string> = {};

  parts.forEach(({ type, value }) => {
    if (type !== 'literal') {
      store[type] = value;
    }
  });

  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value.toUpperCase() ?? '';

  return `${store.year}-${store.month}-${store.day} ${store.hour}:${store.minute}:${store.second} ${dayPeriod} IST`.trim();
};

const writeLog = (level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', args: any[]) => {
  try {
    ensureLogFile();
    const timestamp = formatTimestamp();
    const line = `[${timestamp}] [${level}] ${formatArgs(args)}\n`;
    fs.appendFileSync(logFile, line, { encoding: 'utf8' });
  } catch (error) {
    console.error('Failed to persist log entry', error);
  }
};

export const logger = {
  debug: (...args: any[]) => {
    if (isDebug) {
      console.log(...args);
      writeLog('DEBUG', args);
    }
  },
  info: (...args: any[]) => {
    console.log(...args);
    writeLog('INFO', args);
  },
  warn: (...args: any[]) => {
    console.warn(...args);
    writeLog('WARN', args);
  },
  error: (...args: any[]) => {
    console.error(...args);
    writeLog('ERROR', args);
  },
};

export default logger;

