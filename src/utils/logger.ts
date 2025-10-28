import { config } from '@/config/env';

const isDebug = process.env.DEBUG_LOGS === 'true' || config.nodeEnv === 'development';

export const logger = {
  debug: (...args: any[]) => {
    if (isDebug) console.log(...args);
  },
  info: (...args: any[]) => console.log(...args),
  warn: (...args: any[]) => console.warn(...args),
  error: (...args: any[]) => console.error(...args),
};

export default logger;

