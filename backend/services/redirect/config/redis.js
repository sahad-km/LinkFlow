import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on("connect", () => {
    console.log("Redirect Service: Redis Connected");
});

redis.on("error", (err) => {
    console.error("Redirect Service: Redis Error:", err.message);
});

export default redis;
