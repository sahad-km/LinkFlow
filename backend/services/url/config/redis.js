import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const COUNTER_START = process.env.COUNTER_START || "60000000000";

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on("connect", () => {
    console.log("URL Service: Redis Connected");
});

redis.on("error", (err) => {
    console.error("URL Service: Redis Connection Error:", err.message);
});

/**
 * Ensures the counter in Redis is at least COUNTER_START
 */
export const initCounter = async () => {
    try {
        const currentVal = await redis.get("url:counter");
        if (!currentVal || BigInt(currentVal) < BigInt(COUNTER_START)) {
            await redis.set("url:counter", COUNTER_START.toString());
            console.log(`URL Service: Advanced Redis url:counter to ${COUNTER_START}`);
        }
    } catch (err) {
        console.error("Failed to initialize Redis counter:", err.message);
    }
};

export default redis;
