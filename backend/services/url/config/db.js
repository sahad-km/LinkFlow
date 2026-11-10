import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:mysecretpassword@localhost:5432/postgres";

export const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10
});

export const initTables = async () => {
    await sql`
        CREATE TABLE IF NOT EXISTS urls (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID,
            short_code VARCHAR(50) UNIQUE NOT NULL,
            long_url TEXT NOT NULL,
            title VARCHAR(255),
            clicks BIGINT DEFAULT 0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await sql`
        CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls(short_code);
    `;

    await sql`
        CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls(user_id);
    `;
};

export const connectDB = async () => {
    try {
        await sql`SELECT 1`;
        await initTables();
        console.log("URL Service: PostgreSQL Connected & URLs Table Ready");
    } catch (error) {
        console.error("Error connecting to database:", error);
        process.exit(1);
    }
};

export default sql;