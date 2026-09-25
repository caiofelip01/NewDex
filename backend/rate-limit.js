const buckets = new Map();

export function assertRateLimit(key, options) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + options.windowMs,
    });
    pruneBuckets(now);
    return;
  }

  if (current.count >= options.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    const error = new Error(options.message);
    error.retryAfterSeconds = retryAfterSeconds;
    throw error;
  }

  current.count += 1;
}

function pruneBuckets(now) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}
