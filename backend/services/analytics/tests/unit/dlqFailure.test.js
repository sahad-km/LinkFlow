
import {
    jest,
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
} from "@jest/globals";

// 1. Create a fake Kafka consumer.
let eachMessageHandler;

const mockConsumer = {
    connect: jest.fn(),
    subscribe: jest.fn(),
    run: jest.fn(async (options) => {
        eachMessageHandler = options.eachMessage;
    }),
    commitOffsets: jest.fn(),
    disconnect: jest.fn(),
};

// 2. Mock KafkaJS before importing the consumer.
jest.unstable_mockModule("kafkajs", () => ({
    Kafka: jest.fn(() => ({
        consumer: jest.fn(() => mockConsumer),
    })),
}));

// 3. Mock the DLQ producer.
const mockPublishToDLQ = jest.fn();

jest.unstable_mockModule(
    "../../producers/dlqProducer.js",
    () => ({
        publishToDLQ: mockPublishToDLQ,
    })
);

// 4. Import the consumer AFTER registering mocks.
const {
    connectConsumer,
    disconnectConsumer,
} = await import("../../consumers/clickConsumer.js");

describe("DLQ publishing failure", () => {
    beforeEach(async () => {
        jest.clearAllMocks();
        eachMessageHandler = null;

        await connectConsumer();
    });

    afterEach(async () => {
        await disconnectConsumer();
    });

    test("should not commit the original offset when DLQ publishing fails", async () => {
        // Simulate DLQ publishing failure.
        mockPublishToDLQ.mockRejectedValue(
            new Error("DLQ publishing failed")
        );

        const message = {
            key: Buffer.from("invalid-event"),
            value: Buffer.from("{ invalid JSON"),
            offset: "10",
        };

        // Invoke the consumer's actual message handler.
        await expect(
            eachMessageHandler({
                topic: "click-events-test",
                partition: 0,
                message,
            })
        ).rejects.toThrow("DLQ publishing failed");

        // Verify that DLQ publishing was attempted.
        expect(mockPublishToDLQ).toHaveBeenCalledTimes(1);

        // The original offset must remain uncommitted.
        expect(mockConsumer.commitOffsets).not.toHaveBeenCalled();
    });

    test("should commit the original offset when DLQ publishing succeeds", async () => {
        mockPublishToDLQ.mockResolvedValue(undefined);

        const message = {
            key: Buffer.from("invalid-event-success"),
            value: Buffer.from("{ invalid JSON"),
            offset: "11",
        };

        await eachMessageHandler({
            topic: "click-events-test",
            partition: 0,
            message,
        });

        expect(mockPublishToDLQ).toHaveBeenCalledTimes(1);

        expect(mockConsumer.commitOffsets).toHaveBeenCalledWith([
            {
                topic: "click-events-test",
                partition: 0,
                offset: "12",
            },
        ]);
    });

});
