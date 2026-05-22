import { GoogleGenAI } from '@google/genai';

export class GeminiFreeService {
  private static instance: GeminiFreeService;
  private ai: GoogleGenAI;
  // Use flash-lite for the absolute bare minimum, fastest raw response
  private model = 'gemini-2.5-flash-lite';

  private constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }

  public static getInstance(): GeminiFreeService {
    if (!GeminiFreeService.instance) {
      GeminiFreeService.instance = new GeminiFreeService();
    }
    return GeminiFreeService.instance;
  }

  async generate(prompt: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: prompt,
    });
    return response.text || '';
  }

  async *stream(prompt: string): AsyncGenerator<string, void, unknown> {
    const responseStream = await this.ai.models.generateContentStream({
      model: this.model,
      contents: prompt,
    });
    for await (const chunk of responseStream) {
      if (chunk.text) yield chunk.text;
    }
  }
}