import postgres from "postgres";

const connectionString = process.env.DATABASE_URL || "postgres://postgres:mysecretpassword@localhost:5432/postgres";

export const sql = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10
});

export const initTables = async () => {
    await sql`
        CREATE TABLE IF NOT EXISTS click_events (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            event_id VARCHAR(100),
            link_id UUID,
            short_code VARCHAR(50) NOT NULL,
            ip VARCHAR(50),
            user_agent TEXT,
            browser VARCHAR(50),
            os VARCHAR(50),
            device VARCHAR(50),
            referer TEXT,
            clicked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    `;

    await sql`
        CREATE INDEX IF NOT EXISTS idx_click_events_short_code ON click_events(short_code);
    `;
    await sql`
        CREATE INDEX IF NOT EXISTS idx_click_events_link_id ON click_events(link_id);
    `;
    await sql`
        CREATE INDEX IF NOT EXISTS idx_click_events_clicked_at ON click_events(clicked_at);
    `;
};

export const connectDB = async () => {
    try {
        await sql`SELECT 1`;
        await initTables();
        console.log("Analytics Service: PostgreSQL Connected & click_events Table Ready");
    } catch (error) {
        console.error("Analytics Service: Error connecting to database:", error);
        process.exit(1);
    }
};

export default sql;
