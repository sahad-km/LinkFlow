import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:mysecretpassword@localhost:5432/postgres";

export const sql = postgres(connectionString, {
    max: 15,
    idle_timeout: 20,
    connect_timeout: 10
});

export const connectDB = async () => {
    try {
        await sql`SELECT 1`;
        console.log("Redirect Service: PostgreSQL Connected");
    } catch (error) {
        console.error("Error connecting to database:", error);
        process.exit(1);
    }
};

export default sql;