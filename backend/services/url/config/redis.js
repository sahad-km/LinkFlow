
import Redis from "ioredis";
import logger from "../logger.js";

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
    logger.info("URL Service: Redis Connected");
});

redis.on("error", (err) => {
    logger.error({ err }, "URL Service: Redis Connection Error");
});

/**
 * Connect to Redis and initialize the URL counter.
 */

export const connectRedis = async () => {
    if (redis.status === "wait") {
        await redis.connect();
    }

    await redis.ping();
    logger.info("URL Service: Redis Connected");
};

export const initCounter = async () => {
    try {
        await connectRedis();

        const currentVal = await redis.get("url:counter");

        if (!currentVal || BigInt(currentVal) < BigInt(COUNTER_START)) {
            await redis.set("url:counter", COUNTER_START);
            logger.info({ counterStart: COUNTER_START }, `URL Service: Advanced Redis url:counter to ${COUNTER_START}`);
        }
    } catch (err) {
        logger.error({ err }, "Failed to initialize Redis counter");
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
