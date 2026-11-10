import { Kafka } from "kafkajs";

export const kafka = new Kafka({
    clientId: process.env.KAFKA_CLIENT_ID || "linkflow-analytics-service",
    brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
});

export default kafka;