import { Partitioners } from "kafkajs";
import kafka from '../config/kafka.js';

const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner
});

const connectProducer = async () => {
    try {
        await producer.connect();
        console.log("Redirect Service: Kafka producer connected");
    } catch (error) {
        console.error("Redirect Service: Failed to connect Kafka producer:", error.message);
    }
};

const publishClickEvent = async (event) => {
    try {
        const key = event.linkId ? String(event.linkId) : (event.shortCode ? String(event.shortCode) : null);
        await producer.send({
            topic: "click-events",
            messages: [
                {
                    key,
                    value: JSON.stringify(event),
                },
            ],
        });

        console.log("Kafka click event published successfully:", {
            eventId: event.eventId,
            shortCode: event.shortCode,
            linkId: event.linkId
        });
    } catch (error) {
        console.error("Failed to publish Kafka click event:", error.message);
    }
};

const disconnectProducer = async () => {
    try {
        await producer.disconnect();
        console.log("Redirect Service: Kafka producer disconnected");
    } catch (error) {
        console.error("Redirect Service: Error disconnecting Kafka producer:", error.message);
    }
};

export {
    connectProducer,
    publishClickEvent,
    disconnectProducer
};