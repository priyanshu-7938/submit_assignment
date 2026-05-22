import { PrismaClient, Role, MessageStatus, Communication, Message } from '../generated/prisma';
import { PrismaPg } from "@prisma/adapter-pg";
// Simple in-memory cache configuration interface
interface CacheEntry<T> {
  data: T;
  expiry: number;
}
const connectionString = `${process.env.DATABASE_URL}` as string;

export class DatabaseHandler {
  private static instance: DatabaseHandler | null = null;
  private prisma: PrismaClient;
  
  // Cache maps: keys are communicationId, values hold data + expiration timestamps
  private historyCache = new Map<string, CacheEntry<any>>();
  private communicationCache = new Map<string, CacheEntry<Communication>>();
  
  private readonly DEFAULT_TTL = 90000; // Cache duration: 30 seconds (adjust as needed)

  private constructor() {
    let adapter = new PrismaPg({ connectionString });
    this.prisma = new PrismaClient({ adapter: adapter })
  }

  /**
   * Access the Singleton instance of the Database Handler
   */
  public static getInstance(): DatabaseHandler {
    if (!DatabaseHandler.instance) {
      DatabaseHandler.instance = new DatabaseHandler();
    }
    return DatabaseHandler.instance;
  }

  // =========================================================================
  // CACHE UTILITIES
  // =========================================================================

  private setCache<T>(cacheMap: Map<string, CacheEntry<T>>, key: string, data: T, ttl = this.DEFAULT_TTL): void {
    cacheMap.set(key, {
      data,
      expiry: Date.now() + ttl,
    });
  }

  private getCache<T>(cacheMap: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cacheMap.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      cacheMap.delete(key); // Clear expired entry
      return null;
    }
    return entry.data;
  }

  private invalidateCache(communicationId: string): void {
    this.historyCache.delete(communicationId);
    this.communicationCache.delete(communicationId);
  }

  // =========================================================================
  // CORE CHAT METHODS
  // =========================================================================

  /**
   * Initializes a brand new chat session (Communication)
   */
  public async createCommunication(data: {
    title?: string;
    provider?: string;
    model?: string;
  }): Promise<Communication> {
    const communication = await this.prisma.communication.create({
      data: {
        title: data.title ?? "New Conversation",
        provider: data.provider,
        model: data.model,
      },
    });

    return communication;
  }

  public async getAllCommunications(): Promise<Communication[]> {
    const communications = await this.prisma.communication.findMany({
      orderBy: {
        updatedAt: "desc"
      }
    });

    return communications;
  }


  /**
   * Retrieves a communication metadata record by ID (Cached)
   */
  public async getCommunication(communicationId: string): Promise<Communication | null> {
    const cached = this.getCache(this.communicationCache, communicationId);
    if (cached) return cached;

    const communication = await this.prisma.communication.findUnique({
      where: { id: communicationId },
    });

    if (communication) {
      this.setCache(this.communicationCache, communicationId, communication);
    }
    return communication;
  }

  /**
   * Writes a message (User prompt or Assistant response) to a communication session.
   * Uses an atomic isolated transaction to auto-increment totalMessages and map sequenceNumber safely.
   */
  public async writeMessage(data: {
    communicationId: string;
    role: Role;
    content: string;
    status?: MessageStatus;
    provider?: string;
    model?: string;
    latencyMs?: number;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    errorMessage?: string;
    metadata?: any;
  }): Promise<Message> {
    
    // Execute inside an isolated transaction to protect integrity of the sequence numbers
    const resultMessage = await this.prisma.$transaction(async (tx: any) => {
      // 1. Fetch and update message counter on the parent session
      const communication = await tx.communication.update({
        where: { id: data.communicationId },
        data: {
          totalMessages: { increment: 1 },
        },
        select: { totalMessages: true },
      });

      // 2. Generate preview snippet
      const previewText = data.content.substring(0, 100) + (data.content.length > 100 ? "..." : "");

      // 3. Create the message mapping the precise sequence position
      return await tx.message.create({
        data: {
          communicationId: data.communicationId,
          role: data.role,
          status: data.status ?? MessageStatus.COMPLETED,
          content: data.content,
          preview: previewText,
          sequenceNumber: communication.totalMessages, // Incremented index
          provider: data.provider,
          model: data.model,
          latencyMs: data.latencyMs,
          promptTokens: data.promptTokens,
          completionTokens: data.completionTokens,
          totalTokens: data.totalTokens,
          errorMessage: data.errorMessage,
          metadata: data.metadata,
        },
      });
    });

    // Invalidate caches since structural underlying chat lines shifted
    this.invalidateCache(data.communicationId);

    return resultMessage;
  }

  /**
   * Updates an existing message's content/status mid-process (e.g. Updating STREAMING -> COMPLETED/CANCELLED)
   */
  public async updateMessageStatus(
    messageId: string, 
    data: { 
      status: MessageStatus; 
      content?: string; 
      errorMessage?: string;
      latencyMs?: number;
      promptTokens?: number;
      completionTokens?: number;
      totalTokens?: number;
    }
  ): Promise<Message> {
    const updatedMessage = await this.prisma.message.update({
      where: { id: messageId },
      data: {
        status: data.status,
        content: data.content,
        preview: data.content ? data.content.substring(0, 100) + (data.content.length > 100 ? "..." : "") : undefined,
        errorMessage: data.errorMessage,
        latencyMs: data.latencyMs,
        promptTokens: data.promptTokens,
        completionTokens: data.completionTokens,
        totalTokens: data.totalTokens
      },
    });

    this.invalidateCache(updatedMessage.communicationId);
    return updatedMessage;
  }

  /**
   * Retrieves the structured historical exchange timeline sorted chronologically (Cached)
   */
  public async getHistory(communicationId: string): Promise<Message[]> {
    const cached = this.getCache(this.historyCache, communicationId);
    if (cached) return cached;

    const history = await this.prisma.message.findMany({
      where: { communicationId },
      orderBy: { sequenceNumber: 'asc' }, // Safe sequential order alignment
    });

    this.setCache(this.historyCache, communicationId, history);
    return history;
  }
}