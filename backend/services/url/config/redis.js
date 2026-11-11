
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
const COUNTER_START = process.env.COUNTER_START || "60000000000";

export const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    }
});

redis.on("connect", () => {
    console.log("URL Service: Redis Connected");
});

redis.on("error", (err) => {
    console.error("URL Service: Redis Connection Error:", err.message);
});

/**
 * Connect to Redis and initialize the URL counter.
 */

export const connectRedis = async () => {
    if (redis.status === "wait") {
        await redis.connect();
    }

    await redis.ping();
    console.log("URL Service: Redis Connected");
};

export const initCounter = async () => {
    try {
        await connectRedis();

        const currentVal = await redis.get("url:counter");

        if (!currentVal || BigInt(currentVal) < BigInt(COUNTER_START)) {
            await redis.set("url:counter", COUNTER_START);
            console.log(`URL Service: Advanced Redis url:counter to ${COUNTER_START}`);
        }
    } catch (err) {
        console.error("Failed to initialize Redis counter:", err.message);
        throw err;
    }
};

/**
 * Close Redis connection gracefully.
 */
export const closeRedis = async () => {
    if (redis.status !== "end") {
        await redis.quit();
    }
};

export default redis;
