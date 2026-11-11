
import request from "supertest";
import app from "../../app.js";

describe("URL Service Health API", () => {
    test("GET /health should return 200 and healthy status", async () => {
        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({
            status: "healthy"
        });
    });
});
