    import { createClient, ChatAnalyticsClient } from 'chat-sdk-custom';

    export class ObservabilityService {
    private static instance: ObservabilityService | null = null;
    private client: ChatAnalyticsClient | null = null;

    private constructor() {
        // Vite-specific environment variable access structure
        const endpoint = process.env.ANALYTICS_ENDPOINT;
        const apiKey = process.env.ANALYTICS_KEY;

        if (!endpoint || !apiKey) {
        console.warn(
            "Observability warning: Missing ANALYTICS_ENDPOINT or SANALYTICS_KEY variables in your .env file. Telemetry is operating in fallback/mock mode."
        );
        return;
        }

        try {
        // Initialize the underlying telemetry wrapper instance configuration
        this.client = createClient({
            endpoint,
            apiKey,
            batchSize: 10,             // Flush automatically to prevent data loss or memory pressure
            flushInterval: 8000,      // Fallback timer trigger set to 15 seconds
            flushOnUnload: true,       // Rely on navigator.sendBeacon safely inside browsers
            debug: true, // Automatically enables verbose logging during 'npm run dev'
            session: {
            attributes: {
                environment: "Production", // 'development' or 'production'
                platform: 'browser',
                builder: 'vite'
            }
            }
        });

        // Attach global logging event hooks
        this.client.on('flush:success', ({ messageCount }) => {
            console.log(`[Observability] Successfully synced ${messageCount} telemetry traces to ingest pipeline.`);
        });

        this.client.on('flush:error', ({ error, attempt }) => {
            console.error(`[Observability] Delivery exception encountered: ${error} (Attempt ${attempt})`);
        });

        } catch (error) {
        console.error("Critical failure during telemetry engine setup configuration:", error);
        }
    }

    /**
     * Access the central Singleton execution workspace instance
     */
    public static getInstance(): ObservabilityService {
        if (!ObservabilityService.instance) {
        ObservabilityService.instance = new ObservabilityService();
        }
        return ObservabilityService.instance;
    }


    /**
     * Commits a user or assistant message block to the buffer payload array
     */
    public trackMessage(data: {
        role: 'user' | 'assistant' | 'system' | 'tool';
        content: string;
        model?: string;
        provider?: string;
        latencyMs?: number;
        status?: 'COMPLETED' | 'CANCELLED' | 'ERRORED';
    }): this {
        if (!this.client) return this;

        this.client.track({
        role: data.role,
        content: data.content,
        timestamp: Date.now(),
        metadata: {
            ...(data.model && { model: data.model }),
            ...(data.provider && { provider: data.provider }),
            ...(data.latencyMs && { latencyMs: data.latencyMs }),
            ...(data.status && { status: data.status })
        }
        });

        return this;
    }

    /**
     * Tracks system execution events, server errors, or operational logs.
     * Maps everything cleanly to the SDK's "system" role with log-specific metadata.
     * 
     * @param level The severity or type of log ('info' | 'warn' | 'error' | 'debug')
     * @param content The log message text, stringified object, or stack trace
     * @param context Optional structural parameters (e.g., function name, route path)
     */
    public trackLog(
        level: 'info' | 'warn' | 'error' | 'debug',
        content: string,
        context?: Record<string, any>
    ): this {
        if (!this.client) return this;

        this.client.track({
        role: 'system', // Maps server/application logging safely under the SDK system role
        content: content,
        timestamp: Date.now(),
        metadata: {
            type: 'server_log',
            logLevel: level,
            ...(context && { logContext: context })
        }
        });

        return this;
    }


    /**
     * Forces an immediate transmission dump out to the analytics ingestion server endpoint
     */
    public async forceFlush(): Promise<void> {
        if (!this.client) return;
        await this.client.flush();
    }

    /**
     * Gracefully safely tears down active listeners, timers, and clears lingering queues
     */
    public async terminateService(): Promise<void> {
        if (!this.client) return;
        await this.client.destroy();
        ObservabilityService.instance = null;
    }
}