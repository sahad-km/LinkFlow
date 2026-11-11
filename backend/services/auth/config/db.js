import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:mysecretpassword@localhost:5432/postgres";

export const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
});

export const initTables = async () => {
    // 1. Create users table
    await sql`
        CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'user',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;

    // 2. Create index on email for fast lookups
    await sql`
        CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `;

    // 3. Create refresh_tokens table for rotation and revocation
    await sql`
        CREATE TABLE IF NOT EXISTS refresh_tokens (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(500) NOT NULL UNIQUE,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;

    // 4. Create index on refresh_tokens token & user_id
    await sql`
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token);
    `;
    await sql`
        CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
    `;
};

export const connectDB = async () => {
    try {
        await sql`SELECT 1`;
        await initTables();
        console.log("PostgreSQL Connected & Auth Tables Verified");
    } catch (error) {
        console.error("Error connecting to database:", error);
        throw error;
    }
};

export const closeDB = async () => {
    await sql.end();
    console.log("Auth Service: PostgreSQL connection closed");
};

export default sql;