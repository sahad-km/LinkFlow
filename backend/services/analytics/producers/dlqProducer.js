
import kafka from "../config/kafka.js";
import logger from "../logger.js";

const producer = kafka.producer();

let isConnected = false;

export const connectDLQProducer = async () => {
    if (isConnected) return;

    await producer.connect();
    isConnected = true;

    logger.info("Analytics Service: DLQ producer connected");
};

export const publishToDLQ = async ({
    topic,
    partition,
    message,
    error
}) => {
    if (!isConnected) {
        throw new Error("DLQ producer is not connected");
    }

    const originalValue = message.value?.toString() ?? null;
    const originalKey = message.key?.toString() ?? null;

    const dlqEvent = {
        originalTopic: topic,
        originalPartition: partition,
        originalOffset: message.offset,
        originalKey,
        originalValue,
        failure: {
            name: error.name || "Error",
            message: error.message
        },
        failedAt: new Date().toISOString()
    };

    await producer.send({
        topic: process.env.KAFKA_DLQ_TOPIC || "click-events-dlq",
        acks: -1,
        messages: [
            {
                key: originalKey,
                value: JSON.stringify(dlqEvent),
                headers: {
                    "source-topic": topic,
                    "source-partition": String(partition),
                    "source-offset": String(message.offset),
                    "failure-reason": error.message
                }
            }
        ]
    });

    logger.warn(
        { topic, partition, offset: message.offset, err: error },
        `Analytics Service: Event sent to DLQ [${topic}:${partition}:${message.offset}]`
    );
};

export const disconnectDLQProducer = async () => {
    if (!isConnected) return;

    await producer.disconnect();
    isConnected = false;

    logger.info("Analytics Service: DLQ producer disconnected");
};
