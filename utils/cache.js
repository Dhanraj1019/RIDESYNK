const NodeCache = require("node-cache");

// Initialize cache with 300 seconds TTL (5 minutes)
const cache = new NodeCache({ stdTTL: 300 });

const cacheMiddleware = (req, res, next) => {
    // Only cache GET requests
    if (req.method !== "GET") {
        return next();
    }

    const key = req.originalUrl || req.url;
    const cachedResponse = cache.get(key);

    if (cachedResponse) {
        // Return cached response
        return res.send(cachedResponse);
    } else {
        // Override res.send to capture the response body
        const originalSend = res.send;
        res.send = function (body) {
            // Store response body in cache
            cache.set(key, body);
            // Call the original res.send
            return originalSend.call(this, body);
        };
        next();
    }
};

module.exports = { cacheMiddleware, cache };
