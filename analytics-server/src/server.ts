import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
dotenv.config();
import cors from 'cors';
import { PrismaClient, MessageStatus, Role } from '../generated/prisma/index.js';
import { PrismaPg } from "@prisma/adapter-pg";
import path from 'path';


const connectionString = `${process.env.DATABASE_URL}` as string;
const app = express();
const PORT = process.env.PORT || 4000;
const __dirname = process.cwd();
const dataDirectoryPath = path.join(__dirname, './data');

console.log(`[Init] Establishing connection with PostgreSQL using PrismaPg adapter...`);
let adapter = new PrismaPg({ connectionString });
let prisma = new PrismaClient({ adapter: adapter });

app.use(cors({ origin: '*' }));
app.use(express.static(dataDirectoryPath));
app.use(express.json({ limit: '50mb' })); 

interface SdkIncomingMessage {
  role: 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    model?: string;
    provider?: string;
    latencyMs?: number;
    status?: 'COMPLETED' | 'CANCELLED' | 'ERRORED';
    type?: string;
    logLevel?: string;
    logContext?: Record<string, any>;
  };
}


interface SdkWebhookPayload {
  sdkVersion: string;
  flushedAt: number;
  session: {
    sessionId: string;
    userId?: string;
    tags?: string[];
    attributes?: Record<string, any>;
  };
  messages: SdkIncomingMessage[];
}

app.post('/ingest', async (req: Request, res: Response) => {
  const requestReceivedTime = Date.now();
  console.log(`\n🚀 [Ingest] Received incoming payload batch at ${new Date().toISOString()}`);

  try {
    const payload = req.body as SdkWebhookPayload;
    
    if (!payload || !payload.messages || !Array.isArray(payload.messages)) {
      console.warn(`❌ [Ingest Request Rejected] Payload structure missing a valid 'messages' array format.`);
      return res.status(400).json({ error: "Invalid structural telemetry payload format." });
    }

    const { session, messages } = payload;
    const communicationId = session.attributes?.activeConversationId || null;

    console.log(`📦 [Batch Details] SDK: v${payload.sdkVersion} | Session: ${session.sessionId} | User: ${session.userId || 'anonymous'} | Messages Count: ${messages.length}`);
    if (communicationId) {
      console.log(`🔗 [Session Mapping] Active Communication ID detected: ${communicationId}`);
    }

    let logsProcessed = 0;
    let chatsProcessed = 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isServerLog = msg.metadata?.type === 'server_log' || msg.role === 'system';
      console.log(`➡️ [Item ${i + 1}/${messages.length}] Role: "${msg.role}" | Is System Log: ${isServerLog}`);

      if (isServerLog) {
        await prisma.$transaction(async (tx) => {
          const logLevel = msg.metadata?.logLevel || 'info';
          
          console.log(`   └─💾 Creating InferenceLog & ObservabilityEvent for log level: [${logLevel.toUpperCase()}]`);
          const infLog = await tx.inferenceLog.create({
            data: {
              provider: msg.metadata?.provider || 'system_logger',
              model: msg.metadata?.model || logLevel,
              status: MessageStatus.COMPLETED,
              inputPreview: msg.content.substring(0, 200),
              startedAt: new Date(msg.timestamp),
              communicationId: communicationId,
              metadata: (msg.metadata?.logContext as any) || {}
            }
          });

          await tx.observabilityEvent.create({
            data: {
              inferenceLogId: infLog.id,
              type: `LOG_${logLevel.toUpperCase()}`,
              payload: {
                content: msg.content,
                userId: msg.metadata?.logContext?.userId || session.userId || 'anonymous'
              }
            }
          });
        });
        logsProcessed++;

      } else {
        const mappedRole = Role.ASSISTANT;
        let targetStatus = MessageStatus.COMPLETED;
        
        console.log(`   └─💾 Writing Chat data turn. Model: "${msg.metadata?.model}" | Latency: ${msg.metadata?.latencyMs || 0}ms`);

        await prisma.$transaction(async (tx) => {
          if (communicationId) {
            const countCheck = await tx.message.count({ where: { communicationId } });
            console.log(`   ├─🗂 Existing session messages counter: ${countCheck}. Assigning sequence number: ${countCheck + 1}`);
            
            await tx.message.create({
              data: {
                communicationId,
                role: mappedRole,
                status: targetStatus,
                content: msg.content,
                preview: msg.content.substring(0, 100),
                sequenceNumber: countCheck + 1,
                provider: msg.metadata?.provider || 'unknown',
                model: msg.metadata?.model || 'unknown',
                latencyMs: msg.metadata?.latencyMs || null
              }
            });
          }

          await tx.inferenceLog.create({
            data: {
              communicationId,
              provider: msg.metadata?.provider || 'unknown',
              model: msg.metadata?.model || 'unknown',
              status: targetStatus,
              latencyMs: msg.metadata?.latencyMs || null,
              inputPreview: null,
              outputPreview: msg.content.substring(0, 250),
              startedAt: new Date(msg.timestamp - (msg.metadata?.latencyMs || 0)),
              completedAt: new Date(msg.timestamp)
            }
          });
        });
        chatsProcessed++;
      }
    }

    const executionDuration = Date.now() - requestReceivedTime;
    console.log(`✅ [Ingest Complete] Processed ${messages.length} total nodes (${logsProcessed} logs, ${chatsProcessed} chat instances) inside ${executionDuration}ms.`);

    return res.status(200).json({ success: true, processedItems: messages.length });
  } catch (error) {
    console.error("🚨 Critical error mapping webhook ingestion packet:", error);
    return res.status(500).json({ error: "Internal operational collection failure." });
  }
});

/**
 * GET /api/analytics/summary
 */
app.get('/api/analytics/summary', async (req: Request, res: Response) => {
  console.log(`📊 [API Call] GET /api/analytics/summary`);
  try {
    const totalLogs = await prisma.inferenceLog.count();
    
    const latencyAgg = await prisma.inferenceLog.aggregate({
      _avg: { latencyMs: true },
      where: {
        latencyMs: { not: null },
        status: MessageStatus.COMPLETED
      }
    });

    const statusCounts = await prisma.inferenceLog.groupBy({
      by: ['status'],
      _count: { _all: true }
    });

    const activeChatsCount = await prisma.communication.count();

    console.log(`   └─ Aggregations complete. Logs: ${totalLogs} | Avg Latency: ${Math.round(latencyAgg._avg.latencyMs || 0)}ms | Total Sessions: ${activeChatsCount}`);

    return res.json({
      success: true,
      metrics: {
        totalInferenceRequests: totalLogs,
        activeConversations: activeChatsCount,
        averageLatencyMs: Math.round(latencyAgg._avg.latencyMs || 0),
        statusBreakdown: statusCounts.map(s => ({
          status: s.status,
          count: s._count._all
        }))
      }
    });
  } catch (error: any) {
    console.error(`🚨 [API Error] Failed building performance summary summary:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/models
 */
app.get('/api/analytics/models', async (req: Request, res: Response) => {
  console.log(`📊 [API Call] GET /api/analytics/models`);
  try {
    const modelPerformance = await prisma.inferenceLog.groupBy({
      by: ['provider', 'model'],
      _count: { _all: true },
      _avg: { latencyMs: true },
      where: {
        provider: { not: 'system_logger' }
      }
    });

    console.log(`   └─ Extracted execution performance metrics across ${modelPerformance.length} distinct model variations.`);

    return res.json({
      success: true,
      models: modelPerformance.map(m => ({
        provider: m.provider,
        model: m.model,
        requestCount: m._count._all,
        avgLatencyMs: Math.round(m._avg.latencyMs || 0)
      }))
    });
  } catch (error: any) {
    console.error(`🚨 [API Error] Failed processing model analytics arrays:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/system-logs
 */
app.get('/api/analytics/system-logs', async (req: Request, res: Response) => {
  console.log(`📊 [API Call] GET /api/analytics/system-logs`);
  try {
    const diagnosticLogs = await prisma.inferenceLog.findMany({
      where: { provider: 'system_logger' },
      include: { events: true },
      orderBy: { startedAt: 'desc' },
      take: 50
    });

    console.log(`   └─ Delivering ${diagnosticLogs.length} most recent runtime trace logs.`);

    return res.json({
      success: true,
      logs: diagnosticLogs.map(l => ({
        id: l.id,
        level: l.model, 
        timestamp: l.startedAt,
        message: l.events[0]?.payload || l.inputPreview
      }))
    });
  } catch (error: any) {
    console.error(`🚨 [API Error] Failed retrieving dashboard diagnostic traces:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/analytics/user-retention
 */
app.get('/api/analytics/user-retention', async (req: Request, res: Response) => {
  console.log(`📊 [API Call] GET /api/analytics/user-retention`);
  try {
    const activeTimeline = await prisma.inferenceLog.findMany({
      select: { startedAt: true },
      where: { startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      orderBy: { startedAt: 'asc' }
    });

    const timelineMap: Record<string, number> = {};
    activeTimeline.forEach(log => {
      const dayKey = log.startedAt.toISOString().split('T')[0];
      timelineMap[dayKey] = (timelineMap[dayKey] || 0) + 1;
    });

    console.log(`   └─ Compiled usage frequency trend matrices across past week timeline blocks.`);

    return res.json({
      success: true,
      retentionTrend: Object.keys(timelineMap).map(date => ({
        date,
        totalInteractions: timelineMap[date]
      }))
    });
  } catch (error: any) {
    console.error(`🚨 [API Error] Failed computing daily retention timeline trends:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Start the ingestion engine cluster instance
app.listen(PORT, () => {
  console.log(`⚡ [Telemetry Ingest Cluster Engine running on port ${PORT}]`);
});
