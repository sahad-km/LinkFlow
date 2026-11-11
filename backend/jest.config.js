export default {
    testEnvironment: "node",

    testMatch: [
        "<rootDir>/services/**/tests/**/*.test.js",
        "<rootDir>/gateway/tests/**/*.test.js",
        "<rootDir>/tests/**/*.test.js"
    ],

    collectCoverageFrom: [
        "services/**/*.js",
        "gateway/**/*.js",
        "!services/**/tests/**",
        "!services/**/index.js",
        "!gateway/tests/**",
        "!gateway/index.js"
    ],

    coverageDirectory: "coverage",

    verbose: true
};