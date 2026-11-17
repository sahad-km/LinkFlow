import { Partitioners } from "kafkajs";
import kafka from '../config/kafka.js';
import logger from '../logger.js';

const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner
});

const connectProducer = async () => {
    try {
        await producer.connect();
        logger.info("Redirect Service: Kafka producer connected");
    } catch (error) {
        logger.error(
            { err: error },
            "Redirect Service: Failed to connect Kafka producer"
        );
        throw error;
    }
};

const publishClickEvent = async (event) => {
    const key = event.linkId
        ? String(event.linkId)
        : (event.shortCode ? String(event.shortCode) : null);

    await producer.send({
        topic: "click-events",
        messages: [
            {
                key,
                value: JSON.stringify(event),
            },
        ],
    });

    logger.info({
        eventId: event.eventId,
        shortCode: event.shortCode,
        linkId: event.linkId
    }, "Kafka click event published successfully");
};

const disconnectProducer = async () => {
    try {
        await producer.disconnect();
        logger.info("Redirect Service: Kafka producer disconnected");
    } catch (error) {
        logger.error({ err: error }, "Redirect Service: Error disconnecting Kafka producer");
    }
};

export {
    connectProducer,
    publishClickEvent,
    disconnectProducer
};