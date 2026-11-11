import "dotenv/config";
import app from "./app.js";

const PORT = process.env.PORT || 8000;

app.listen(PORT, () => {
    console.log(`Gateway server is running on port ${PORT} with rate limiting enabled`);
});