
import {
    encodeBase62,
    decodeBase62
} from "../../utils/base62.utils.js";

describe("Base62 Utility", () => {

    describe("encodeBase62()", () => {

        test("should encode zero", () => {
            expect(encodeBase62(0)).toBe("0");
        });

        test("should encode positive numbers", () => {
            expect(encodeBase62(10)).toBe("a");
            expect(encodeBase62(61)).toBe("Z");
            expect(encodeBase62(62)).toBe("10");
        });

        test("should support BigInt values", () => {
            expect(encodeBase62(123456789n)).toBe(
                encodeBase62(123456789)
            );
        });

        test("should encode large numbers", () => {
            const value = 9007199254740993n;

            const encoded = encodeBase62(value);

            expect(typeof encoded).toBe("string");
            expect(encoded.length).toBeGreaterThan(0);
        });

        test("should reject negative numbers", () => {
            expect(() => encodeBase62(-10)).toThrow(
                "Input must be a non-negative integer"
            );
        });
    });

    describe("decodeBase62()", () => {

        test("should decode valid Base62 strings", () => {
            expect(decodeBase62("0")).toBe(0n);
            expect(decodeBase62("a")).toBe(10n);
            expect(decodeBase62("Z")).toBe(61n);
            expect(decodeBase62("10")).toBe(62n);
        });

        test("should decode large numbers", () => {
            const value = 9007199254740993n;

            const encoded = encodeBase62(value);
            const decoded = decodeBase62(encoded);

            expect(decoded).toBe(value);
        });

        test("should throw for invalid characters", () => {
            expect(() => decodeBase62("abc@")).toThrow(
                "Invalid Base62 character: @"
            );
        });
    });

    describe("Round-trip testing", () => {

        test("should recover the original number after encoding and decoding", () => {
            const values = [
                0n,
                1n,
                10n,
                61n,
                62n,
                100n,
                9999n,
                123456789n,
                9007199254740993n
            ];

            values.forEach((value) => {
                const encoded = encodeBase62(value);
                const decoded = decodeBase62(encoded);

                expect(decoded).toBe(value);
            });
        });
    });
});
