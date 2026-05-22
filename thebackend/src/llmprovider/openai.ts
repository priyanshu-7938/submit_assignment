import OpenAI from 'openai';

export class OpenAIFreeService {
  private static instance: OpenAIFreeService;
  private client: OpenAI;
  private model = 'openai/gpt-oss-20b'; // Totally free testing tier model

  private constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY, // Get a free key at openrouter.ai
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }

  public static getInstance(): OpenAIFreeService {
    if (!OpenAIFreeService.instance) {
      OpenAIFreeService.instance = new OpenAIFreeService();
    }
    return OpenAIFreeService.instance;
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.choices[0]?.message?.content || '';
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }
}