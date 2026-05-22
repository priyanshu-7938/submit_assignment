import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Guardrail configuration
 */
interface GuardrailConfig {
  maxMessageLength?: number;
  maxMessagesPerSession?: number;
  maxTokensPerResponse?: number;
  rateLimitPerMinute?: number;
  enablePromptInjectionCheck?: boolean;
  enableToxicityCheck?: boolean;
}

/**
 * Validation result
 */
interface ValidationResult {
  isValid: boolean;
  error?: string;
  errorCode?: string;
  reason?: string;
}

/**
 * Rate limit tracker
 */
interface RateLimitEntry {
  count: number;
  resetAt: number;
}

/**
 * Singleton Guardrail Service - Protects against malicious/unethical input
 */
class Guards {
  private static instance: Guards;
  private config: Required<GuardrailConfig>;
  private genAI: GoogleGenerativeAI;
  private moderationModel: any;
  private rateLimitMap: Map<string, RateLimitEntry>;

  // Prompt injection patterns
  private readonly INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?(previous|above|prior)\s+(instructions?|prompts?|commands?)/i,
    /forget\s+(everything|all)\s+(you\s+)?(were\s+)?(told|learned|know)/i,
    /disregard\s+(all\s+)?(previous|above|prior)/i,
    /you\s+are\s+now\s+(a\s+)?(different|new)/i,
    /system\s*:\s*ignore/i,
    /\[SYSTEM\]/i,
    /pretend\s+(you|to\s+be)/i,
    /act\s+as\s+(if|though)/i,
    /new\s+instructions?/i,
    /override\s+(previous|system)/i,
    /jailbreak/i,
    /prompt\s+injection/i,
    /<\|im_start\|>/i,
    /<\|im_end\|>/i,
  ];

  // Unethical content patterns
  private readonly UNETHICAL_PATTERNS = [
    /how\s+to\s+(hack|crack|exploit|bypass)/i,
    /generate\s+(malware|virus|exploit)/i,
    /illegal\s+(drugs|weapons|activities)/i,
    /create\s+(fake|counterfeit|forged)/i,
    /bypass\s+(security|authentication|protection)/i,
  ];

    private constructor(config?: GuardrailConfig) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is not defined");
        }
        this.config = {
            maxMessageLength: config?.maxMessageLength || 2000,
            maxMessagesPerSession: config?.maxMessagesPerSession || 100,
            maxTokensPerResponse: config?.maxTokensPerResponse || 2048,
            rateLimitPerMinute: config?.rateLimitPerMinute || 20,
            enablePromptInjectionCheck: config?.enablePromptInjectionCheck ?? true,
            enableToxicityCheck: config?.enableToxicityCheck ?? true,
        };

        this.rateLimitMap = new Map();

        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        this.moderationModel = this.genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
        });

        setInterval(() => this.cleanupRateLimits(), 60000);
    }

    public static getInstance(config?: GuardrailConfig): Guards {
        if (!Guards.instance) {
            Guards.instance = new Guards(config);
        }
        return Guards.instance;
    }

    // validate fxn
    async validate(
        message: string,
        userId: string,
        sessionMessageCount?: number
    ): Promise<ValidationResult> {
        try {
            // 1. Basic validation
            const basicCheck = this.validateBasicRules(message);
            if (!basicCheck.isValid) return basicCheck;

            // 2. Rate limit check
            const rateLimitCheck = this.checkRateLimit(userId);
            if (!rateLimitCheck.isValid) return rateLimitCheck;

            // 3. Session message limit
            if (sessionMessageCount !== undefined) {
                const sessionCheck = this.checkSessionLimit(sessionMessageCount);
                if (!sessionCheck.isValid) return sessionCheck;
            }

            // 4. Pattern-based checks (fast, synchronous)
            if (this.config.enablePromptInjectionCheck) {
                const injectionCheck = this.detectPromptInjection(message);
                if (!injectionCheck.isValid) return injectionCheck;
            }

            // 5. Unethical content check
            const unethicalCheck = this.detectUnethicalContent(message);
            if (!unethicalCheck.isValid) return unethicalCheck;

            // 6. AI-powered toxicity detection (slower, but more accurate)
            if (this.config.enableToxicityCheck && this.moderationModel) {
                const toxicityCheck = await this.detectToxicity(message);
                if (!toxicityCheck.isValid) return toxicityCheck;
            }

            return { isValid: true };
        } catch (error) {
            console.error("Guardrail validation error:", error);
            return {
                isValid: false,
                error: "Unable to validate message. Please try again.",
                errorCode: "VALIDATION_ERROR",
            };
        }
    }
    async validateWithNext<T>(
        message: string,
        userId: string,
        next: () => Promise<T>,
        sessionMessageCount?: number
    ): Promise<T> {
        const result = await this.validate(message, userId, sessionMessageCount);

        if (!result.isValid) {
        throw {
            statusCode: 400,
            error: result.error || "Message validation failed",
            errorCode: result.errorCode,
            reason: result.reason,
        };
        }

        return await next();
    }


    //validating basic chek
    private validateBasicRules(message: string): ValidationResult {
        // Empty message
        if (!message || message.trim().length === 0) {
            return {
                isValid: false,
                error: "Message cannot be empty.",
                errorCode: "EMPTY_MESSAGE",
            };
        }

        // Message too long
        if (message.length > this.config.maxMessageLength) {
            return {
                isValid: false,
                error: `Message is too long. Maximum ${this.config.maxMessageLength} characters allowed.`,
                errorCode: "MESSAGE_TOO_LONG",
            };
        }

        // Only whitespace
        if (!/\S/.test(message)) {
            return {
                isValid: false,
                error: "Message contains only whitespace.",
                errorCode: "INVALID_CONTENT",
            };
        }
        return { isValid: true };
    }

    // rate limit check.
    private checkRateLimit(userId: string): ValidationResult {
        const now = Date.now();
        const entry = this.rateLimitMap.get(userId);

        if (entry) {
            if (now < entry.resetAt) {
                if (entry.count >= this.config.rateLimitPerMinute) {
                return {
                    isValid: false,
                    error: "Rate limit exceeded. Please wait a moment before sending another message.",
                    errorCode: "RATE_LIMIT_EXCEEDED",
                    reason: `Maximum ${this.config.rateLimitPerMinute} messages per minute`,
                };
                }
                entry.count++;
            } else {
                // Reset the counter
                this.rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
            }
        } else {
            this.rateLimitMap.set(userId, { count: 1, resetAt: now + 60000 });
        }

        return { isValid: true };
    }
    private checkSessionLimit(messageCount: number): ValidationResult {
        if (messageCount >= this.config.maxMessagesPerSession) {
        return {
            isValid: false,
            error: `Session limit reached. Maximum ${this.config.maxMessagesPerSession} messages per session.`,
            errorCode: "SESSION_LIMIT_REACHED",
            reason: "Please start a new conversation",
        };
        }
        return { isValid: true };
    }

    // prompt injection chcek
    private detectPromptInjection(message: string): ValidationResult {
        for (const pattern of this.INJECTION_PATTERNS) {
            if (pattern.test(message)) {
                console.warn(`⚠️ Prompt injection detected: ${message.substring(0, 100)}`);
                return {
                isValid: false,
                error: "Your message contains potentially harmful content. Please rephrase your question.",
                errorCode: "PROMPT_INJECTION_DETECTED",
                reason: "Detected attempt to override system instructions",
                };
            }
        }
        return { isValid: true };
    }

    //detection methofds...
    private detectUnethicalContent(message: string): ValidationResult {
        for (const pattern of this.UNETHICAL_PATTERNS) {
            if (pattern.test(message)) {
                console.warn(`⚠️ Unethical content detected: ${message.substring(0, 100)}`);
                return {
                isValid: false,
                error: "I can't help with that request. Please ask something else.",
                errorCode: "UNETHICAL_CONTENT",
                reason: "Message contains potentially harmful or illegal content",
                };
            }
        }
        return { isValid: true };
    }
    //moderator check
    private async detectToxicity(message: string): Promise<ValidationResult> {
        try {
            const prompt = `Analyze the following message for toxicity, harassment, hate speech, or extremely offensive content. 
    Respond with ONLY "SAFE" or "UNSAFE".

    Message: "${message}"

    Response:`;

            const result = await this.moderationModel.generateContent(prompt);
            const response = result.response.text().trim().toUpperCase();

            if (response.includes("UNSAFE")) {
                console.warn(`⚠️ Toxic content detected: ${message.substring(0, 100)}`);
                return {
                isValid: false,
                error: "Your message violates our community guidelines. Please be respectful.",
                errorCode: "TOXIC_CONTENT",
                reason: "Message contains offensive or inappropriate content",
                };
            }

            return { isValid: true };
        } catch (error) {
            console.error("Toxicity check error:", error);
            // Fail open - don't block if moderation fails
            return { isValid: true };
        }
    }

  
    //utility methond
    getRateLimitStatus(userId: string): {
        remaining: number;
        resetIn: number;
    } {
        const entry = this.rateLimitMap.get(userId);
        if (!entry) {
            return {
            remaining: this.config.rateLimitPerMinute,
            resetIn: 60,
            };
        }

        const now = Date.now();
        return {
            remaining: Math.max(0, this.config.rateLimitPerMinute - entry.count),
            resetIn: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
        };
    }

    getStats(): {
        activeUsers: number;
        totalRequests: number;
    } {
        let totalRequests = 0;
        for (const entry of this.rateLimitMap.values()) {
        totalRequests += entry.count;
        }

        return {
        activeUsers: this.rateLimitMap.size,
        totalRequests,
        };
    }
    private cleanupRateLimits(): void {
        const now = Date.now();
        for (const [userId, entry] of this.rateLimitMap.entries()) {
            if (now > entry.resetAt) {
                this.rateLimitMap.delete(userId);
            }
        }
    }
}

export default Guards.getInstance({
    maxMessageLength: 500,
    maxMessagesPerSession: 50,
    maxTokensPerResponse: 200,
    enablePromptInjectionCheck: true,
    enableToxicityCheck: true
});
export type { GuardrailConfig, ValidationResult };