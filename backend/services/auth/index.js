import "dotenv/config";
import app from "./app.js";
import { connectDB } from "./config/db.js";

const PORT = process.env.PORT || 8001;

const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Auth server is running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start Auth service:", error);
        process.exit(1);
    }
};

startServer();