const BASE62_CHARS = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";

/**
 * Encodes an integer/BigInt into a Base62 string
 * @param {number|bigint|string} num
 * @returns {string}
 */
export const encodeBase62 = (num) => {
    let n = BigInt(num);
    if (n === 0n) return BASE62_CHARS[0];

    const base = BigInt(62);
    let result = "";

    while (n > 0n) {
        const remainder = Number(n % base);
        result = BASE62_CHARS[remainder] + result;
        n = n / base;
    }

    return result;
};

/**
 * Decodes a Base62 string back to a BigInt
 * @param {string} str
 * @returns {bigint}
 */
export const decodeBase62 = (str) => {
    let num = 0n;
    const base = BigInt(62);

    for (let i = 0; i < str.length; i++) {
        const char = str[i];
        const index = BASE62_CHARS.indexOf(char);
        if (index === -1) {
            throw new Error(`Invalid Base62 character: ${char}`);
        }
        num = num * base + BigInt(index);
    }

    return num;
};
