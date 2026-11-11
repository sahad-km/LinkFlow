/**
 * Lightweight User-Agent parser to categorize browser, operating system, and device type.
 */
export const parseUserAgent = (uaString = "") => {
    if (!uaString || typeof uaString !== "string") {
        return { browser: "Direct/Unknown", os: "Unknown", device: "Desktop" };
    }

    let browser = "Other";
    if (/edg/i.test(uaString)) browser = "Edge";
    else if (/opr\/|opera/i.test(uaString)) browser = "Opera";
    else if (/chrome|crios/i.test(uaString)) browser = "Chrome";
    else if (/firefox|fxios/i.test(uaString)) browser = "Firefox";
    else if (/safari/i.test(uaString) && !/chrome/i.test(uaString)) browser = "Safari";
    else if (/msie|trident/i.test(uaString)) browser = "Internet Explorer";
    else if (/curl|postman|insomnia|wget|httpie/i.test(uaString)) browser = "API Client";

    let os = "Other";
    if (/windows nt 10/i.test(uaString)) os = "Windows 10/11";
    else if (/windows/i.test(uaString)) os = "Windows";
    else if (/android/i.test(uaString)) os = "Android";
    else if (/iphone|ipad|ipod/i.test(uaString)) os = "iOS";
    else if (/macintosh|mac os x/i.test(uaString)) os = "macOS";
    else if (/linux/i.test(uaString)) os = "Linux";

    let device = "Desktop";
    if (/tablet|ipad/i.test(uaString)) device = "Tablet";
    else if (/mobile/i.test(uaString)) device = "Mobile";
    else if (/bot|spider|crawl/i.test(uaString)) device = "Bot";

    return { browser, os, device };
};
