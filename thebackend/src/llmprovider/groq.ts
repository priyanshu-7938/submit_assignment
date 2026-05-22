import OpenAI from 'openai';

export class GroqFreeService {
  private static instance: GroqFreeService;
  private client: OpenAI;
  private model = 'llama-3.1-8b-instant'; // Heaviest free rate limit tier on Groq

  private constructor() {
    this.client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY, // Get a free key at console.groq.com
      baseURL: 'https://api.groq.com/openai/v1',
    });
  }

  public static getInstance(): GroqFreeService {
    if (!GroqFreeService.instance) {
      GroqFreeService.instance = new GroqFreeService();
    }
    return GroqFreeService.instance;
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