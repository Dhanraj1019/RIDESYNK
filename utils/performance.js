const USER_CACHE_TTL_MS = Number(process.env.USER_CACHE_TTL_MS) || 30000; // Increased to 30s for better performance
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000;
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX) || 180;

const userCache = new Map();
const requestBuckets = new Map();

function getCachedUser(id) {
    const key = String(id || "");
    const entry = userCache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
        userCache.delete(key);
        return null;
    }
    return entry.user;
}

function setCachedUser(id, user) {
    if (!id || !user) return;
    userCache.set(String(id), {
        user,
        expiresAt: Date.now() + USER_CACHE_TTL_MS
    });
}

function invalidateCachedUser(id) {
    if (id) userCache.delete(String(id));
}

function requestTimingLogger(req, res, next) {
    const started = process.hrtime.bigint();

    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
        const category = durationMs < 200 ? "fast" : durationMs <= 1000 ? "moderate" : "slow";

        if (process.env.REQUEST_TIMING_LOGS === "false" && category === "fast") return;

        // console.log(`[perf:${category}] ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms`);
    });

    next();
}

function basicRateLimit(options = {}) {
    const windowMs = options.windowMs || RATE_LIMIT_WINDOW_MS;
    const max = options.max || RATE_LIMIT_MAX;

    return (req, res, next) => {
        const key = req.ip || req.socket.remoteAddress || "unknown";
        const now = Date.now();
        let bucket = requestBuckets.get(key);

        if (!bucket || bucket.resetAt <= now) {
            bucket = { count: 0, resetAt: now + windowMs };
            requestBuckets.set(key, bucket);
        }

        bucket.count += 1;
        if (bucket.count > max) {
            res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
            return res.status(429).send("Too many requests");
        }

        next();
    };
}

setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of requestBuckets.entries()) {
        if (bucket.resetAt <= now) requestBuckets.delete(key);
    }
    for (const [key, entry] of userCache.entries()) {
        if (entry.expiresAt <= now) userCache.delete(key);
    }
}, 60 * 1000).unref();

module.exports = {
    basicRateLimit,
    getCachedUser,
    invalidateCachedUser,
    requestTimingLogger,
    setCachedUser
};
