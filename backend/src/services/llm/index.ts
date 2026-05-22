import { GoogleGenerativeAI, Content, Part } from "@google/generative-ai";
import { Role } from "../../../generated/prisma/client.js";

interface GeminiConfig {
    model: string;
    temperature?: number;
    topK?: number;
    topP?: number;
    maxOutputTokens?: number;
}

interface ChatMessage {
    id: number;
    role: Role;
    content: string;
    createdAt: string;
}

class GeminiClient {
    private static instance: GeminiClient;
    private genAI: GoogleGenerativeAI;
    private model: any;
    private config: GeminiConfig;
    private systemPrompt: string;

    private constructor(config?: GeminiConfig) {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY is not defined");
        }

        this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        
        // Default configuration
        this.config = {
            model: config?.model as string,
            temperature: config?.temperature || 0.7,
            topK: config?.topK || 40,
            topP: config?.topP || 0.95,
            maxOutputTokens: config?.maxOutputTokens || 8192,
        };

        this.model = this.genAI.getGenerativeModel({
            model: this.config.model,
            generationConfig: {
            temperature: this.config.temperature,
            topK: this.config.topK,
            topP: this.config.topP,
            maxOutputTokens: this.config.maxOutputTokens,
            },
        });

        // Default system prompt
        this.systemPrompt = this.buildSystemPrompt();
    }

    /**
     * Get the singleton instance
     */
    public static getInstance(config?: GeminiConfig): GeminiClient {
    if (!GeminiClient.instance) {
        GeminiClient.instance = new GeminiClient(config);
    }
    return GeminiClient.instance;
    }


    private buildSystemPrompt(companyName?: string, customInstructions?: string): string {
        return `You are a helpful and knowledgeable AI assistant for anybody that ask you to communicate, you provide info aout normal things.

Your responsibilities:
- never exceed aver 400 words in respense.
- Always try to provide accurate and concise information.

${customInstructions || ""}

Remember: Always prioritize user satisfaction and accurate information delivery.`;
    }

    private formatHistory(history: ChatMessage[]): Content[] {
        return history.map((msg) => ({
            role: msg.role === "BOT" ? "model" : "user",
            parts: [{ text: msg.content }] as Part[],
        }));
    }

    /*
        for cases where the user is back after some time. and usee this one for that one.. once a user have 3 texts or more it shifts to the generator funciton.
    */
    async generateReply(
    history: ChatMessage[],
    context: string,
    query: string
    ): Promise<string> {
    try {
        // Step 1: Build the enhanced prompt with context
        const enhancedPrompt = this.buildEnhancedPrompt(context, query);

        // Step 2: Format conversation history
        const formattedHistory = this.formatHistory(history);

        // Step 3: Start chat session with history
        const chat = this.model.startChat({
        history: formattedHistory,
        generationConfig: {
            temperature: this.config.temperature,
            topK: this.config.topK,
            topP: this.config.topP,
            maxOutputTokens: this.config.maxOutputTokens,
        },
        });

        // Step 4: Generate response
        const result = await chat.sendMessage(enhancedPrompt);
        const response = result.response;
        const text = response.text();

        return text;
    } catch (error) {
        console.error("Error generating reply:", error);
        throw new Error(`Failed to generate reply: ${error}`);
    }
    }

    private buildEnhancedPrompt(context: string, query: string): string {
        let prompt = this.systemPrompt + "\n\n";

        if (context && context.trim().length > 0) {
            prompt += `RELEVANT CONTEXT (use this to answer the question):\n${context}\n\n`;
        }

        prompt += `USER QUERY:\n${query}\n\n`;
        prompt += `Please provide a helpful and accurate response based on the context provided above. If the context doesn't contain relevant information, use your general knowledge but mention that you're doing so.`;

        return prompt;
    }

    async generateSimpleReply(query: string, context?: string): Promise<string> {
    try {
        const prompt = context
        ? this.buildEnhancedPrompt(context, query)
        : `${this.systemPrompt}\n\n${query}`;

        const result = await this.model.generateContent(prompt);
        const response = result.response;
        return response.text();
    } catch (error) {
        console.error("Error generating simple reply:", error);
        throw new Error(`Failed to generate simple reply: ${error}`);
    }
    }

    async *generateStreamReply(
    history: ChatMessage[],
    context: string,
    query: string
    ): AsyncGenerator<string, void, unknown> {
        try {
            const enhancedPrompt = this.buildEnhancedPrompt(context, query);
            const formattedHistory = this.formatHistory(history);

            const chat = this.model.startChat({
                history: formattedHistory,
            });

            const result = await chat.sendMessageStream(enhancedPrompt);

            for await (const chunk of result.stream) {
                const text = chunk.text();
                yield text;
            }
        } catch (error) {
            console.error("Error generating streaming reply:", error);
            throw new Error(`Failed to generate streaming reply: ${error}`);
        }
    }
}

export default GeminiClient.getInstance({
    model: "gemini-2.5-flash-lite",
    temperature: 0.7,
    topK: 40,
    topP: 0.95,
    maxOutputTokens: 8192, 
});
export type { ChatMessage, GeminiConfig };