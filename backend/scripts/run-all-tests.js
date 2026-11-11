#!/usr/bin/env node

/**
 * LinkFlow Master Test Runner
 *
 * Sequentially executes tests across microservices with their dedicated
 * isolated test environments (.env.test), avoiding port, database, and
 * Kafka consumer group collisions.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const suites = [
    {
        name: "Gateway Service",
        envFile: null,
        args: ["--experimental-vm-modules", "./node_modules/jest/bin/jest.js", "--runInBand", "gateway/tests"],
    },
    {
        name: "Auth Service (Unit & API)",
        envFile: "services/auth/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/auth/tests/unit",
            "services/auth/tests/api",
        ],
    },
    {
        name: "Auth Service (PostgreSQL Integration)",
        envFile: "services/auth/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/auth/tests/integration",
        ],
    },
    {
        name: "URL Service (Unit & API)",
        envFile: "services/url/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/url/tests/unit",
            "services/url/tests/api",
        ],
    },
    {
        name: "URL Service (PostgreSQL & Redis Integration)",
        envFile: "services/url/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/url/tests/integration",
        ],
    },
    {
        name: "Redirect Service (Unit & API)",
        envFile: "services/redirect/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/redirect/tests/unit",
            "services/redirect/tests/api",
        ],
    },
    {
        name: "Redirect Service (PostgreSQL, Redis & Kafka Integration)",
        envFile: "services/redirect/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/redirect/tests/integration",
        ],
    },
    {
        name: "Analytics Service (Unit)",
        envFile: "services/analytics/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/analytics/tests/unit",
        ],
    },
    {
        name: "Analytics Service (Kafka Consumer & API Integration)",
        envFile: "services/analytics/.env.test",
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "services/analytics/tests/integration",
        ],
    },
    {
        name: "End-to-End Pipeline (Cross-Service Workflow)",
        envFile: null,
        args: [
            "--experimental-vm-modules",
            "./node_modules/jest/bin/jest.js",
            "--runInBand",
            "--forceExit",
            "tests/e2e",
        ],
    },
];

const runSuite = (suite) => {
    return new Promise((resolve) => {
        const startTime = Date.now();
        console.log(`\n============================================================`);
        console.log(`  RUNNING: ${suite.name}`);
        console.log(`============================================================\n`);

        const nodeArgs = [
            "--max-old-space-size=4096",
            "--max-semi-space-size=64",
        ];
        if (suite.envFile) {
            nodeArgs.push(`--env-file=${suite.envFile}`);
        }
        nodeArgs.push(...suite.args);

        const child = spawn(process.execPath, nodeArgs, {
            cwd: rootDir,
            stdio: "inherit",
            env: { ...process.env, CI: "true" },
        });

        child.on("close", (code) => {
            const durationMs = Date.now() - startTime;
            resolve({
                name: suite.name,
                code,
                durationMs,
                passed: code === 0,
            });
        });

        child.on("error", (err) => {
            console.error(`Failed to launch ${suite.name}:`, err);
            resolve({
                name: suite.name,
                code: 1,
                durationMs: Date.now() - startTime,
                passed: false,
            });
        });
    });
};

const main = async () => {
    const totalStart = Date.now();
    const results = [];

    for (const suite of suites) {
        const res = await runSuite(suite);
        results.push(res);
        if (!res.passed) {
            console.error(`\n[FAILED] ${suite.name} exited with code ${res.code}\n`);
        }
    }

    const totalDuration = ((Date.now() - totalStart) / 1000).toFixed(2);
    console.log(`\n\n============================================================`);
    console.log(`             LINKFLOW TEST SUITE SUMMARY REPORT              `);
    console.log(`============================================================`);

    let allPassed = true;
    for (const res of results) {
        const status = res.passed ? "✔ PASS" : "✖ FAIL";
        const dur = (res.durationMs / 1000).toFixed(2) + "s";
        console.log(`  ${status.padEnd(8)} | ${res.name.padEnd(52)} | ${dur.padStart(8)}`);
        if (!res.passed) allPassed = false;
    }

    console.log(`------------------------------------------------------------`);
    console.log(`  Total Duration: ${totalDuration}s`);
    console.log(`  Overall Status: ${allPassed ? "ALL TEST SUITES PASSED" : "SOME SUITES FAILED"}`);
    console.log(`============================================================\n`);

    process.exit(allPassed ? 0 : 1);
};

main();
