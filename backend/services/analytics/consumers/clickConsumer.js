import kafka from "../config/kafka.js";
import { sql } from "../config/db.js";
import { parseUserAgent } from "../utils/parser.js";

const consumer = kafka.consumer({
    groupId: "linkflow-analytics-group",
});

export const connectConsumer = async () => {
    try {
        await consumer.connect();
        console.log("Analytics Service: Kafka consumer connected");

        await consumer.subscribe({
            topic: "click-events",
            fromBeginning: true,
        });
        console.log("Analytics Service: Subscribed to 'click-events' topic");

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const rawValue = message.value ? message.value.toString() : "{}";
                    const event = JSON.parse(rawValue);

                    const {
                        eventId,
                        linkId,
                        shortCode,
                        clickedAt,
                        ip,
                        userAgent,
                        referer
                    } = event;

                    if (!shortCode) return;

                    // Parse client details
                    const { browser, os, device } = parseUserAgent(userAgent);

                    // 1. Resolve link_id if not present
                    let resolvedLinkId = linkId;
                    if (!resolvedLinkId) {
                        const [urlRow] = await sql`
                            SELECT id FROM urls WHERE short_code = ${shortCode} LIMIT 1
                        `;
                        resolvedLinkId = urlRow?.id || null;
                    }

                    // 2. Persist detailed click record in click_events table
                    await sql`
                        INSERT INTO click_events (
                            event_id,
                            link_id,
                            short_code,
                            ip,
                            user_agent,
                            browser,
                            os,
                            device,
                            referer,
                            clicked_at
                        ) VALUES (
                            ${eventId || null},
                            ${resolvedLinkId || null},
                            ${shortCode},
                            ${ip || null},
                            ${userAgent || null},
                            ${browser},
                            ${os},
                            ${device},
                            ${referer || null},
                            ${clickedAt ? new Date(clickedAt) : new Date()}
                        )
                    `;

                    // 3. Atomically increment total click count in urls table
                    // (Fulfilling asynchronous SQL persistence via Kafka stream)
                    await sql`
                        UPDATE urls
                        SET clicks = clicks + 1, updated_at = CURRENT_TIMESTAMP
                        WHERE short_code = ${shortCode}
                    `;

                    console.log(`Analytics Service: Processed click event for [${shortCode}] (${browser} on ${os}, ${device})`);
                } catch (error) {
                    console.error("Analytics Service: Error processing Kafka click message:", error.message);
                }
            },
        });
    } catch (error) {
        console.error("Analytics Service: Failed to initialize Kafka consumer:", error.message);
    }
};

export const disconnectConsumer = async () => {
    try {
        await consumer.disconnect();
        console.log("Analytics Service: Kafka consumer disconnected");
    } catch (error) {
        console.error("Analytics Service: Error disconnecting Kafka consumer:", error.message);
    }
};