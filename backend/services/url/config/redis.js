import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const COUNTER_START = parseInt(process.env.COUNTER_START || "10000000", 10);

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
 * Initializes the counter in Redis if it does not already exist
 */
export const initCounter = async () => {
    try {
        const exists = await redis.exists("url:counter");
        if (!exists) {
            // Set initial counter value (NX = only set if not exists)
            await redis.set("url:counter", COUNTER_START, "NX");
            console.log(`URL Service: Initialized Redis url:counter to ${COUNTER_START}`);
        }
    } catch (err) {
        console.error("Failed to initialize Redis counter:", err.message);
    }
};

export default redis;
