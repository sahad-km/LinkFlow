import { jest, describe, test, expect, beforeEach } from "@jest/globals";

const mockSend = jest.fn();
const mockConnect = jest.fn();
const mockDisconnect = jest.fn();

jest.unstable_mockModule("kafkajs", () => ({
    Partitioners: {
        DefaultPartitioner: jest.fn()
    }
}));

jest.unstable_mockModule("../../config/kafka.js", () => ({
    default: {
        producer: () => ({
            send: mockSend,
            connect: mockConnect,
            disconnect: mockDisconnect
        })
    }
}));

const {
    connectProducer,
    publishClickEvent,
    disconnectProducer
} = await import("../../producers/clickProducer.js");

describe("Redirect clickProducer Unit Tests", () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test("connectProducer() should connect the Kafka producer", async () => {
        mockConnect.mockResolvedValueOnce(undefined);
        await expect(connectProducer()).resolves.toBeUndefined();
        expect(mockConnect).toHaveBeenCalledTimes(1);
    });

    test("connectProducer() should throw if Kafka connection fails", async () => {
        mockConnect.mockRejectedValueOnce(new Error("Kafka broker unavailable"));
        await expect(connectProducer()).rejects.toThrow("Kafka broker unavailable");
    });

    test("publishClickEvent() should partition by linkId when present", async () => {
        mockSend.mockResolvedValueOnce([]);

        const event = {
            eventId: "evt-123",
            linkId: "link-uuid-456",
            shortCode: "code789",
            clickedAt: new Date().toISOString()
        };

        await publishClickEvent(event);

        expect(mockSend).toHaveBeenCalledWith({
            topic: "click-events",
            messages: [
                {
                    key: "link-uuid-456",
                    value: JSON.stringify(event)
                }
            ]
        });
    });

    test("publishClickEvent() should fall back to shortCode as partition key when linkId is null", async () => {
        mockSend.mockResolvedValueOnce([]);

        const event = {
            eventId: "evt-123",
            linkId: null,
            shortCode: "code789",
            clickedAt: new Date().toISOString()
        };

        await publishClickEvent(event);

        expect(mockSend).toHaveBeenCalledWith({
            topic: "click-events",
            messages: [
                {
                    key: "code789",
                    value: JSON.stringify(event)
                }
            ]
        });
    });

    test("publishClickEvent() should use null key when neither linkId nor shortCode is available", async () => {
        mockSend.mockResolvedValueOnce([]);

        const event = {
            eventId: "evt-123",
            linkId: null,
            shortCode: null
        };

        await publishClickEvent(event);

        expect(mockSend).toHaveBeenCalledWith({
            topic: "click-events",
            messages: [
                {
                    key: null,
                    value: JSON.stringify(event)
                }
            ]
        });
    });

    test("disconnectProducer() should disconnect gracefully", async () => {
        mockDisconnect.mockResolvedValueOnce(undefined);
        await expect(disconnectProducer()).resolves.toBeUndefined();
        expect(mockDisconnect).toHaveBeenCalledTimes(1);
    });

    test("disconnectProducer() should catch and log disconnect errors without crashing", async () => {
        mockDisconnect.mockRejectedValueOnce(new Error("Disconnect network timeout"));
        // Should catch the error internally
        await expect(disconnectProducer()).resolves.toBeUndefined();
    });
});
