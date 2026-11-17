import postgres from "postgres";
import logger from "../logger.js";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:mysecretpassword@localhost:5432/postgres";

export const sql = postgres(connectionString, {
    max: 15,
    idle_timeout: 20,
    connect_timeout: 10
});

export const connectDB = async () => {
    try {
        await sql`SELECT 1`;
        logger.info("Redirect Service: PostgreSQL Connected");
    } catch (error) {
        logger.error({ err: error }, "Error connecting to database");
        process.exit(1);
    }
};

export const closeDB = async () => {
    await sql.end();
    logger.info("Redirect Service: PostgreSQL connection closed");
};

export default sql;