import { Request, Response, NextFunction } from 'express';
import NodeCache from 'node-cache';

// Create cache instance with 5 minute TTL
const cache = new NodeCache({ stdTTL: 300 });

export interface CacheOptions {
  key: string;
  ttl?: number; // Time to live in seconds
}

export const cacheMiddleware = (options: CacheOptions) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const cacheKey = `${options.key}:${JSON.stringify(req.query)}`;
    
    // Check if data exists in cache
    const cachedData = cache.get(cacheKey);
    if (cachedData) {
      return res.json(cachedData);
    }

    // Store original json method
    const originalJson = res.json;

    // Override json method to cache response
    res.json = function(data: any) {
      // Cache the response
      cache.set(cacheKey, data, options.ttl || 300);
      
      // Call original json method
      return originalJson.call(this, data);
    };

    return next();
  };
};

// Clear cache for specific pattern
export const clearCache = (pattern: string) => {
  const keys = cache.keys();
  const matchingKeys = keys.filter(key => key.includes(pattern));
  cache.del(matchingKeys);
};

// Clear all cache
export const clearAllCache = () => {
  cache.flushAll();
};

export default cache;

