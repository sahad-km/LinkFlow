
import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initCounter } from "./config/redis.js";

const PORT = process.env.PORT || 8002;

const startServer = async () => {
    try {
        // Connect to dependencies before accepting requests
        await connectDB();
        await initCounter();

        app.listen(PORT, () => {
            console.log(`URL server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start URL service:", error);
        process.exit(1);
    }
};

startServer();
