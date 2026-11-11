
import kafka from "../config/kafka.js";
import { sql } from "../config/db.js";
import { parseUserAgent } from "../utils/parser.js";
import { publishToDLQ } from "../producers/dlqProducer.js";

let isConnected = false;

const consumer = kafka.consumer({
    groupId: process.env.KAFKA_GROUP_ID || "linkflow-analytics-group",
});

// Identifies errors caused by permanently invalid events.
class PermanentEventError extends Error {
    constructor(message) {
        super(message);
        this.name = "PermanentEventError";
    }
}

const commitMessageOffset = async ({ topic, partition, message }) => {
    await consumer.commitOffsets([
        {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
        },
    ]);
};

export const connectConsumer = async () => {
    if (isConnected) {
        throw new Error("Analytics consumer is already connected");
    }

    try {
        await consumer.connect();
        isConnected = true;
        console.log("Analytics Service: Kafka consumer connected");

        const topic = process.env.KAFKA_TOPIC || "click-events";

        await consumer.subscribe({
            topic,
            fromBeginning: true,
        });

        console.log(`Analytics Service: Subscribed to '${topic}' topic`);

        await consumer.run({
            autoCommit: false,
            partitionsConsumedConcurrently: 1,

            eachMessage: async ({ topic, partition, message }) => {
                try {
                    // 1. Parse and validate the event.
                    const rawValue = message.value?.toString() ?? "{}";

                    let event;

                    try {
                        event = JSON.parse(rawValue);
                    } catch {
                        throw new PermanentEventError(
                            "Click event contains invalid JSON"
                        );
                    }

                    if (!event || typeof event !== "object" || Array.isArray(event)) {
                        throw new PermanentEventError(
                            "Click event must be a JSON object"
                        );
                    }

                    const {
                        eventId,
                        linkId,
                        shortCode,
                        clickedAt,
                        ip,
                        userAgent,
                        referer,
                    } = event;

                    if (typeof eventId !== "string" || !eventId.trim()) {
                        throw new PermanentEventError(
                            "Click event is missing a valid eventId"
                        );
                    }

                    if (typeof shortCode !== "string" || !shortCode.trim()) {
                        throw new PermanentEventError(
                            "Click event is missing a valid shortCode"
                        );
                    }

                    if (
                        clickedAt &&
                        Number.isNaN(new Date(clickedAt).getTime())
                    ) {
                        throw new PermanentEventError(
                            "Click event contains an invalid clickedAt"
                        );
                    }

                    const { browser, os, device } =
                        parseUserAgent(userAgent);

                    // 2. Process the event atomically.
                    const wasProcessed = await sql.begin(async (tx) => {
                        // Insert first to preserve duplicate-event idempotency.
                        const insertedEvents = await tx`
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
                            )
                            VALUES (
                                ${eventId},
                                ${linkId || null},
                                ${shortCode},
                                ${ip || null},
                                ${userAgent || null},
                                ${browser},
                                ${os},
                                ${device},
                                ${referer || null},
                                ${clickedAt ? new Date(clickedAt) : new Date()}
                            )
                            ON CONFLICT (event_id)
                            WHERE event_id IS NOT NULL
                            DO NOTHING
                            RETURNING id
                        `;

                        // Already processed: don't increment clicks again.
                        if (insertedEvents.length === 0) {
                            return false;
                        }

                        // Resolve the actual URL and lock it during this transaction.
                        const [urlRow] = await tx`
                            SELECT id
                            FROM urls
                            WHERE short_code = ${shortCode}
                            LIMIT 1
                            FOR UPDATE
                        `;

                        if (!urlRow) {
                            throw new PermanentEventError(
                                `No URL found for short code: ${shortCode}`
                            );
                        }

                        // Don't allow an event to reference a different URL.
                        if (
                            linkId &&
                            String(linkId).toLowerCase() !==
                            String(urlRow.id).toLowerCase()
                        ) {
                            throw new PermanentEventError(
                                `linkId does not match shortCode: ${shortCode}`
                            );
                        }

                        // Store the canonical URL ID.
                        await tx`
                            UPDATE click_events
                            SET link_id = ${urlRow.id}
                            WHERE event_id = ${eventId}
                        `;

                        // Increment the URL count in the same transaction.
                        await tx`
                            UPDATE urls
                            SET clicks = clicks + 1,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = ${urlRow.id}
                        `;

                        return true;
                    });

                    if (!wasProcessed) {
                        console.log(
                            `Analytics Service: Duplicate event ignored [${eventId}]`
                        );
                    } else {
                        console.log(
                            `Analytics Service: Processed click event for [${shortCode}] (${browser} on ${os}, ${device})`
                        );
                    }

                    // 3. Commit only after successful database processing.
                    await commitMessageOffset({ topic, partition, message });

                } catch (error) {
                    console.error(
                        "Analytics Service: Error processing Kafka click message:",
                        error.message
                    );

                    // 4. Permanently invalid events go to the DLQ.
                    if (error instanceof PermanentEventError) {
                        await publishToDLQ({
                            topic,
                            partition,
                            message,
                            error,
                        });

                        // Commit only after DLQ publishing succeeds.
                        await commitMessageOffset({
                            topic,
                            partition,
                            message,
                        });

                        console.log(
                            `Analytics Service: Permanently failed event committed after DLQ publishing [${message.offset}]`
                        );

                        return;
                    }

                    // 5. Infrastructure/transient errors must be retried.
                    throw error;
                }
            },
        });
    } catch (error) {
        console.error(
            "Analytics Service: Failed to start Kafka consumer:",
            error.message
        );

        if (isConnected) {
            try {
                await consumer.disconnect();
                isConnected = false;

                console.log(
                    "Analytics Service: Disconnected after startup failure"
                );
            } catch (disconnectError) {
                console.error(
                    "Analytics Service: Cleanup failed:",
                    disconnectError.message
                );
            }
        }

        throw error;
    }
};

export const disconnectConsumer = async () => {
    if (!isConnected) return;

    try {
        await consumer.disconnect();
        isConnected = false;

        console.log("Analytics Service: Kafka consumer disconnected");
    } catch (error) {
        console.error(
            "Analytics Service: Error disconnecting Kafka consumer:",
            error.message
        );

        throw error;
    }
};
