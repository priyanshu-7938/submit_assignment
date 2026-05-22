import { Request, Response, NextFunction } from 'express';
import { createClient } from "chat-sdk-custom"; // Adjust import to your path

// 1. Initialize your client instance globally using env variables
export const analyticsSdk = createClient({
    endpoint: process.env.ANALYTICS_WEBHOOK_URL || "http://localhost:4000/ingest",
    apiKey: process.env.ANALYTICS_API_KEY || "test-api-key-123",
    flushInterval: 2000, // Flushes buffers automatically every 2 seconds
    batchSize: 5,        // Or every 5 messages
});

/**
 * Chat Analytics Middleware
 * Tracks incoming user messages and captures outgoing bot replies seamlessly.
 */
export const chatAnalyticsMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const { sessionId, message } = req.body;

    // 2. If the request doesn't have the expected body params, skip tracking and proceed
    if (!sessionId || !message) {
        return next();
    }

    // 3. Associate the current request context with this specific session ID dynamically
    // Using trackBatch ensures these records explicitly bind to the active conversation context.
    analyticsSdk.track({
        role: "user",
        content: message,
        timestamp: Date.now()
    });

    // 4. Monkey-patch res.json to capture the response *after* the bot generates it
    const originalJson = res.json;

    res.json = function (body: any) {
        try {
            // Check if it's a successful response matching your controller's signature
            if (body && body.status === true && body.response) {
                analyticsSdk.track({
                    role: "assistant", // Using 'assistant' as per standard LLM/SDK terminology
                    content: body.response,
                    timestamp: Date.now()
                });
            }
        } catch (error) {
            // Non-blocking: ensure analytics errors don't crash the active client request
            console.error("[Analytics Middleware] Error tracking assistant response:", error);
        }

        // Restore original functionality and send the data back to the client
        return originalJson.call(this, body);
    };

    next();
};
