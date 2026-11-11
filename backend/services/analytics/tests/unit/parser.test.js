import { describe, test, expect } from "@jest/globals";
import { parseUserAgent } from "../../utils/parser.js";

describe("User-Agent Parser Utility", () => {
    test("should handle empty, null, or invalid input", () => {
        expect(parseUserAgent("")).toEqual({
            browser: "Direct/Unknown",
            os: "Unknown",
            device: "Desktop"
        });

        expect(parseUserAgent(null)).toEqual({
            browser: "Direct/Unknown",
            os: "Unknown",
            device: "Desktop"
        });

        expect(parseUserAgent(undefined)).toEqual({
            browser: "Direct/Unknown",
            os: "Unknown",
            device: "Desktop"
        });

        expect(parseUserAgent(12345)).toEqual({
            browser: "Direct/Unknown",
            os: "Unknown",
            device: "Desktop"
        });
    });

    test("should detect Chrome on macOS", () => {
        const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Chrome");
        expect(result.os).toBe("macOS");
        expect(result.device).toBe("Desktop");
    });

    test("should detect Edge on Windows 10/11", () => {
        const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Edge");
        expect(result.os).toBe("Windows 10/11");
        expect(result.device).toBe("Desktop");
    });

    test("should detect Safari on iPhone (Mobile)", () => {
        const ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Safari");
        expect(result.os).toBe("iOS");
        expect(result.device).toBe("Mobile");
    });

    test("should detect iPad as Tablet", () => {
        const ua = "Mozilla/5.0 (iPad; CPU OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Safari");
        expect(result.os).toBe("iOS");
        expect(result.device).toBe("Tablet");
    });

    test("should detect Firefox on Linux", () => {
        const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Firefox");
        expect(result.os).toBe("Linux");
        expect(result.device).toBe("Desktop");
    });

    test("should detect Opera browser", () => {
        const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36 OPR/105.0.0.0";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Opera");
    });

    test("should detect Internet Explorer (Trident/MSIE)", () => {
        const ua = "Mozilla/5.0 (compatible; MSIE 10.0; Windows NT 6.1; Trident/6.0)";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Internet Explorer");
        expect(result.os).toBe("Windows");
    });

    test("should detect API Clients (curl, postman, insomnia)", () => {
        expect(parseUserAgent("curl/7.88.1").browser).toBe("API Client");
        expect(parseUserAgent("PostmanRuntime/7.32.3").browser).toBe("API Client");
        expect(parseUserAgent("insomnia/2023.5.8").browser).toBe("API Client");
    });

    test("should detect web crawlers and search bots", () => {
        const ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
        const result = parseUserAgent(ua);
        expect(result.device).toBe("Bot");
    });

    test("should fall back to 'Other' for unrecognized patterns", () => {
        const ua = "CustomNovelBrowser/1.0 (Solaris OS)";
        const result = parseUserAgent(ua);
        expect(result.browser).toBe("Other");
        expect(result.os).toBe("Other");
        expect(result.device).toBe("Desktop");
    });
});
