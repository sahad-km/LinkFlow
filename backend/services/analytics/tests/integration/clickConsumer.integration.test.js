
import {
    jest,
    describe,
    test,
    expect,
    beforeAll,
    afterAll,
} from "@jest/globals";

import { Kafka } from "kafkajs";
import { randomUUID } from "node:crypto";
import { sql } from "../../config/db.js";
import {
    connectConsumer,
    disconnectConsumer,
} from "../../consumers/clickConsumer.js";
import {
    connectDLQProducer,
    disconnectDLQProducer,
} from "../../producers/dlqProducer.js";

const kafka = new Kafka({
    clientId: "linkflow-analytics-integration-test-producer",
    brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

const producer = kafka.producer();

describe("Analytics Kafka Integration", () => {
    let shortCode;
    let eventId;
    let urlId;

    beforeAll(async () => {
        // Create a unique URL for this test run.
        shortCode = `a-${randomUUID()}`;
        eventId = randomUUID();

        const [url] = await sql`
            INSERT INTO urls (short_code, long_url, title, clicks)
            VALUES (
                ${shortCode},
                'https://example.com/integration-test',
                'Analytics Integration Test',
                0
            )
            RETURNING id
        `;

        urlId = url.id;

        // Connect the producer and actual analytics consumer.
        await producer.connect();
        await connectDLQProducer();
        await connectConsumer();
    });


    afterAll(async () => {
        await disconnectConsumer();
        await disconnectDLQProducer();
        await producer.disconnect();
        await sql.end();
    }, 20000);

    test("should persist a Kafka click event and increment URL clicks", async () => {
        const clickEvent = {
            eventId,
            linkId: urlId,
            shortCode,
            clickedAt: new Date().toISOString(),
            ip: "127.0.0.1",
            userAgent: "Mozilla/5.0",
            referer: "https://example.com",
        };

        await producer.send({
            topic: process.env.KAFKA_TOPIC || "click-events-test",
            messages: [
                {
                    key: shortCode,
                    value: JSON.stringify(clickEvent),
                },
            ],
        });

        // Wait for the asynchronous Kafka consumer to persist the event.
        let clickRows = [];
        let urlRows = [];

        for (let attempt = 0; attempt < 30; attempt++) {
            clickRows = await sql`
                SELECT event_id, short_code
                FROM click_events
                WHERE event_id = ${eventId}
            `;

            urlRows = await sql`
                SELECT clicks
                FROM urls
                WHERE short_code = ${shortCode}
            `;

            if (clickRows.length === 1 && Number(urlRows[0]?.clicks) === 1) {
                break;
            }

            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        expect(clickRows).toHaveLength(1);
        expect(clickRows[0].short_code).toBe(shortCode);
        expect(Number(urlRows[0].clicks)).toBe(1);
    }, 15000);

    test("should send malformed JSON events to the DLQ", async () => {
        const marker = `invalid-json-test-${randomUUID()}`;
        const receivedMessages = [];

        const dlqConsumer = kafka.consumer({
            groupId: `linkflow-dlq-test-${randomUUID()}`,
        });

        await dlqConsumer.connect();

        await dlqConsumer.subscribe({
            topic: process.env.KAFKA_DLQ_TOPIC || "click-events-dlq-test",
            fromBeginning: true,
        });

        await dlqConsumer.run({
            eachMessage: async ({ message }) => {
                const event = JSON.parse(message.value.toString());

                if (event.originalKey === marker) {
                    receivedMessages.push(event);
                }
            },
        });

        try {
            await producer.send({
                topic: process.env.KAFKA_TOPIC || "click-events-test",
                messages: [
                    {
                        key: marker,
                        value: "{ invalid JSON",
                    },
                ],
            });

            // Wait for the matching DLQ event.
            for (let attempt = 0; attempt < 30; attempt++) {
                if (receivedMessages.length > 0) break;

                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            expect(receivedMessages).toHaveLength(1);

            const dlqEvent = receivedMessages[0];

            expect(dlqEvent.originalTopic).toBe(
                process.env.KAFKA_TOPIC || "click-events-test"
            );

            expect(dlqEvent.originalValue).toBe("{ invalid JSON");

            expect(dlqEvent.failure.message).toBe(
                "Click event contains invalid JSON"
            );

            expect(dlqEvent.originalOffset).toBeDefined();
            expect(dlqEvent.failedAt).toBeDefined();
        } finally {
            await dlqConsumer.disconnect();
        }
    }, 20000);



    test("should ignore duplicate Kafka events without incrementing clicks twice", async () => {
        const duplicateEventId = randomUUID();
        const duplicateShortCode = `d-${randomUUID()}`;

        const [url] = await sql`
        INSERT INTO urls (short_code, long_url, title, clicks)
        VALUES (
            ${duplicateShortCode},
            'https://example.com/duplicate-test',
            'Duplicate Event Test',
            0
        )
        RETURNING id
    `;

        const clickEvent = {
            eventId: duplicateEventId,
            linkId: url.id,
            shortCode: duplicateShortCode,
            clickedAt: new Date().toISOString(),
            ip: "127.0.0.1",
            userAgent: "Mozilla/5.0",
            referer: "https://example.com",
        };

        const message = {
            key: duplicateShortCode,
            value: JSON.stringify(clickEvent),
        };

        // Publish the exact same event twice.
        await producer.send({
            topic: process.env.KAFKA_TOPIC || "click-events-test",
            messages: [message, message],
        });

        let clickRows = [];
        let urlRows = [];

        for (let attempt = 0; attempt < 30; attempt++) {
            clickRows = await sql`
            SELECT event_id
            FROM click_events
            WHERE event_id = ${duplicateEventId}
        `;

            urlRows = await sql`
            SELECT clicks
            FROM urls
            WHERE short_code = ${duplicateShortCode}
        `;

            if (clickRows.length === 1 && Number(urlRows[0]?.clicks) === 1) break;

            await new Promise((resolve) => setTimeout(resolve, 500));
        }

        expect(clickRows).toHaveLength(1);
        expect(Number(urlRows[0].clicks)).toBe(1);
    }, 15000);


    test("should recover an uncommitted event after a database failure", async () => {
        const failureShortCode = `f-${randomUUID()}`;
        const failureEventId = randomUUID();

        const [url] = await sql`
        INSERT INTO urls (short_code, long_url, title, clicks)
        VALUES (
            ${failureShortCode},
            'https://example.com/recovery-test',
            'Database Recovery Test',
            0
        )
        RETURNING id
    `;

        // Create a PostgreSQL trigger that simulates an insertion failure.
        await sql`
        CREATE OR REPLACE FUNCTION linkflow_test_fail_click_insert()
        RETURNS TRIGGER AS $$
        BEGIN
            RAISE EXCEPTION 'Simulated analytics database failure';
        END;
        $$ LANGUAGE plpgsql;
    `;

        await sql`
        CREATE TRIGGER linkflow_test_fail_click_trigger
        BEFORE INSERT ON click_events
        FOR EACH ROW
        EXECUTE FUNCTION linkflow_test_fail_click_insert();
    `;

        try {
            const clickEvent = {
                eventId: failureEventId,
                linkId: url.id,
                shortCode: failureShortCode,
                clickedAt: new Date().toISOString(),
                ip: "127.0.0.1",
                userAgent: "Mozilla/5.0",
                referer: "https://example.com",
            };

            // Publish the event while PostgreSQL is rejecting inserts.
            await producer.send({
                topic: process.env.KAFKA_TOPIC || "click-events-test",
                messages: [
                    {
                        key: failureShortCode,
                        value: JSON.stringify(clickEvent),
                    },
                ],
            });

            // Allow the consumer time to attempt processing.
            await new Promise((resolve) => setTimeout(resolve, 1500));

            // The event must not have been persisted.
            const failedRows = await sql`
            SELECT event_id
            FROM click_events
            WHERE event_id = ${failureEventId}
        `;

            expect(failedRows).toHaveLength(0);

            // Stop the consumer before removing the simulated failure.
            await disconnectConsumer();

            // Remove the database failure.
            await sql`
            DROP TRIGGER linkflow_test_fail_click_trigger
            ON click_events;
        `;

            await sql`
            DROP FUNCTION linkflow_test_fail_click_insert();
        `;

            // Restart the consumer. It should receive the uncommitted event again.
            await connectConsumer();

            let clickRows = [];
            let urlRows = [];

            for (let attempt = 0; attempt < 30; attempt++) {
                clickRows = await sql`
                SELECT event_id, short_code
                FROM click_events
                WHERE event_id = ${failureEventId}
            `;

                urlRows = await sql`
                SELECT clicks
                FROM urls
                WHERE short_code = ${failureShortCode}
            `;

                if (clickRows.length === 1 && Number(urlRows[0]?.clicks) === 1) {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            expect(clickRows).toHaveLength(1);
            expect(clickRows[0].short_code).toBe(failureShortCode);
            expect(Number(urlRows[0].clicks)).toBe(1);
        } finally {
            await sql`
                DROP TRIGGER IF EXISTS linkflow_test_fail_click_trigger
                ON click_events;
            `;

            await sql`
                DROP FUNCTION IF EXISTS linkflow_test_fail_click_insert();
            `;
        }
    }, 20000);


    test("should send valid JSON that is not an object to the DLQ", async () => {
        const marker = `null-test-${randomUUID()}`;
        const receivedMessages = [];

        const dlqConsumer = kafka.consumer({
            groupId: `linkflow-dlq-null-test-${randomUUID()}`,
        });

        await dlqConsumer.connect();

        await dlqConsumer.subscribe({
            topic: process.env.KAFKA_DLQ_TOPIC || "click-events-dlq-test",
            fromBeginning: true,
        });

        await dlqConsumer.run({
            eachMessage: async ({ message }) => {
                const event = JSON.parse(message.value.toString());

                if (event.originalKey === marker) {
                    receivedMessages.push(event);
                }
            },
        });

        try {
            await producer.send({
                topic: process.env.KAFKA_TOPIC || "click-events-test",
                messages: [{ key: marker, value: "null" }],
            });

            for (let attempt = 0; attempt < 30; attempt++) {
                if (receivedMessages.length > 0) break;
                await new Promise((resolve) => setTimeout(resolve, 500));
            }

            expect(receivedMessages).toHaveLength(1);
            expect(receivedMessages[0].failure.message).toBe(
                "Click event must be a JSON object"
            );
        } finally {
            await dlqConsumer.disconnect();
        }
    }, 30000);



});
