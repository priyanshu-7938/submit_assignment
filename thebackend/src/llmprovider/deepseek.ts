import OpenAI from 'openai';

export class DeepSeekFreeService {
  private static instance: DeepSeekFreeService;
  private client: OpenAI;
  private model = 'deepseek/deepseek-v4-flash:free';

  private constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
    });
  }

  public static getInstance(): DeepSeekFreeService {
    if (!DeepSeekFreeService.instance) {
      DeepSeekFreeService.instance = new DeepSeekFreeService();
    }
    return DeepSeekFreeService.instance;
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