// Minimal in-memory rate limiter (per process). Good enough for a single
// server; swap for a shared store (e.g. Redis) if you run several instances.
module.exports = function rateLimit({ windowMs, max, keyFn, message }) {
  const hits = new Map();

  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.reset <= now) hits.delete(key);
    }
  }, windowMs).unref();

  return (req, res, next) => {
    const key = keyFn ? keyFn(req) : req.ip;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      const msg = message || 'Too many requests. Please try again later.';
      return res.status(429).json({ msg, message: msg });
    }
    next();
  };
};
