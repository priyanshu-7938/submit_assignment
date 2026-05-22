import dotenv from 'dotenv';
dotenv.config();
import express, { Request, Response } from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { GeminiFreeService } from './llmprovider/gemini'; // Your custom model service
import { DatabaseHandler } from './db';     // Our database utility
import { Role, MessageStatus } from '../generated/prisma';
import { OpenAIFreeService } from './llmprovider/openai';
import { GroqFreeService } from './llmprovider/groq';
import { DeepSeekFreeService } from './llmprovider/deepseek';
import * as pf from 'pii-filter';
import path from 'path';
import { ObservabilityService } from './sdk_singelton';

// Use process.cwd() for __dirname in CommonJS build targets
// const __dirname = process.cwd();
// 1. Initialize the filter using the library factory functions
const piiFilterInstance = pf.make_pii_classifier(pf.languages.nl.make_lm());
const sdk_observer = ObservabilityService.getInstance();
// console.log(__dirname, "current working directory");
const dataDirectoryPath = path.join(__dirname, '../data');
// A secure, multi-tenant vault mapped by communicationId

const models = [
    {
        provider: "google",
        model: "gemini-2.5-flash-lite"
    },
    {
        provider: "openai",
        model: "gpt-4.1"
    },
    {
        provider: "deepseek",
        model: "deepseek/deepseek-v4-flash:free"
    },
    {
        provider: "groq",
        model: "llama-3.1-8b-instant"
    }
];

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
//   cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(dataDirectoryPath));

// const modelService = GeminiFreeService.getInstance();
const db = DatabaseHandler.getInstance();

// Tracks active AbortSignals to break generation loops upon cancellation request
const activeCancellations = new Map<string, AbortController>();

// ==========================================
// REST API ROUTES
// ==========================================

/**
 * Route: Start a new conversation session
 * Body: { title?: string, provider?: string, model?: string }
 */
app.post('/api/conversations', async (req: Request, res: Response) => {
  try {
    const { title, provider, model } = req.body;

    // Use default values if none are explicitly provided
    const communication = await db.createCommunication({
      title: title ?? "New Chat Session",
      provider: provider ?? "google",
      model: model ?? "gemini-2.5-flash-lite"
    });
    
    return res.status(201).json(communication);
  } catch (error) {
    console.error("Failed to create conversation:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * Route: Fetch all conversation sessions
 */
app.get('/api/conversations', async (_req: Request, res: Response) => {
  try {
    const conversations = await db.getAllCommunications();

    return res.status(200).json({
      success: true,
      count: conversations.length,
      conversations
    });

  } catch (error) {
    console.error("Failed to fetch conversations:", error);

    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
});

// route to get the abvaialbe models: 
app.get('/api/models', async (_req: Request, res: Response) => {
  try {
    return res.status(200).json({
      success: true,
      count: models.length,
      models
    });

  } catch (error) {
    console.error("Failed to fetch models:", error);

    return res.status(500).json({
      success: false,
      error: "Internal Server Error"
    });
  }
});

/**
 * Route: Fetch complete conversational history
 * Params: :id (The communication uuid)
 */
app.get('/api/conversations/:id/history', async (req: Request, res: Response) => {
  try {
    const communicationId = req.params.id as string;
    
    const session = await db.getCommunication(communicationId);
    if (!session) {
      return res.status(404).json({ error: "Conversation session not found." });
    }

    const history = await db.getHistory(communicationId);
    return res.json({ communicationId, history });
  } catch (error) {
    console.error("Failed to fetch history:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

function getModelService(provider: string) {
    switch (provider) {
        case "google":
            return GeminiFreeService.getInstance();
        case "openai":
            return OpenAIFreeService.getInstance();
        case "deepseek":
            return DeepSeekFreeService.getInstance();
        case "groq":
            return GroqFreeService.getInstance();
        default:
            throw new Error(`Unsupported provider: ${provider}`);
    }
}


// ==========================================
// SOCKET.IO REAL-TIME & STREAMING LOGIC
// ==========================================

io.on('connection', (socket) => {
  console.log(`Client linked: ${socket.id}`);
    sdk_observer.trackLog('info', 'A user connected: ' + socket.id, {timestamp: new Date().toISOString(), userId: socket.id});


  /**
   * Event: send_message
   * Expects: { communicationId: string, message: string }
   */
  socket.on('send_message', async (data) => {
    const { communicationId, message } = data;
    const startTime = Date.now();

    if (!communicationId || !message) {
      return socket.emit('error', { message: "Missing communicationId or message payload." });
    }
    
    let accumulatedText = "";
    try {
      // 1. Fetch current conversation details
      const session = await db.getCommunication(communicationId);
      if (!session) {
        return socket.emit('error', { message: "Invalid or nonexistent communication session." });
      }

      // 2. Commit User prompt to Database
      await db.writeMessage({
        communicationId,
        role: Role.USER,
        content: message,
        status: MessageStatus.COMPLETED
      });

      // 3. Fetch past history timeline for model context framing
      const historyLog = await db.getHistory(communicationId);
      
      // Formatting the text prompt containing history context cleanly for the service
      let contextPrompt = "";
      for (const turn of historyLog) {
        contextPrompt += `${turn.role === Role.USER ? 'User' : 'Model'}: ${turn.content}\n`;
      }
      // Append instruction indicator for the new response turn
      contextPrompt += `Model:`;

      // 4. Overwrite/Abort duplicate streams running on this channel if any
      if (activeCancellations.has(communicationId)) {
        activeCancellations.get(communicationId)?.abort();
        activeCancellations.delete(communicationId);
      }

      const controller = new AbortController();
      activeCancellations.set(communicationId, controller);

      // 5. Build streaming message block placeholder in Database
      const assistantMessagePlaceholder = await db.writeMessage({
        communicationId,
        role: Role.ASSISTANT,
        status: MessageStatus.STREAMING,
        content: "",
        provider: session.provider ?? "google",
        model: session.model ?? "gemini-2.5-flash-lite"
      });

      // use db to fetch the model type here.. and based on the type use a model.
      const modelService = getModelService(session.provider); // Implement this function to return the correct service instance based on provider
      // 6. Consume the AsyncGenerator stream from the custom model service
      // clean the prompt: with pii-filter

      const responseGenerator = modelService.stream(contextPrompt);

      for await (const chunk of responseGenerator) {
        // Intercept and break out immediately if user triggered cancellation signal
        if (controller.signal.aborted) {
          throw new DOMException("Generation stopped by user.", "AbortError");
        }

        accumulatedText += chunk;
        
        // Broadcast current textual chunk out to client application
        socket.emit('stream_chunk', {
            communicationId,
            messageId: assistantMessagePlaceholder.id,
            text: chunk
        });
    }
        const totalLatency = Date.now() - startTime;
        const sanitizedLLMResponse = piiFilterInstance.sanitize_str(accumulatedText, true);
        // use the sdk to send the message.
        // console.log(`🔒 [Secure Log - Model Response]: ${sanitizedLLMResponse}`);
        // sdk call here......!!!!!!!!!!!!!

        sdk_observer.trackMessage({
            role: 'assistant',
            content: sanitizedLLMResponse,
            model: session.model ?? "gemini-2.5-flash-lite",
            provider: session.provider ?? "google",
            latencyMs: totalLatency,
            status: 'COMPLETED'
        });

      // 7. Successful Stream Termination: Mark completed and save payload
      await db.updateMessageStatus(assistantMessagePlaceholder.id, {
        status: MessageStatus.COMPLETED,
        content: accumulatedText,
        latencyMs: totalLatency
      });

      activeCancellations.delete(communicationId);
      socket.emit('stream_complete', { communicationId, messageId: assistantMessagePlaceholder.id });

    } catch (error: any) {
      // 8. Graceful Exception Handling (Cancellation or Crash)
      if (error.name === 'AbortError' || activeCancellations.get(communicationId)?.signal.aborted) {
        console.log(`Stream generation manually cut short for conversation: ${communicationId}`);
        
        const currentHistory = await db.getHistory(communicationId);
        const streamingPlaceholder = currentHistory.find((m: any) => m.status === MessageStatus.STREAMING);

        if (streamingPlaceholder) {
          await db.updateMessageStatus(streamingPlaceholder.id, {
            status: MessageStatus.CANCELLED,
            content: accumulatedText || "Generation interrupted by client application."
          });
        }

        socket.emit('stream_cancelled', {
          communicationId,
          message: "The streaming channel generation was interrupted successfully.",
          partialText: accumulatedText
        });
      } else {
        console.error("Underlying Inference Exception Raised:", error);
        
        const currentHistory = await db.getHistory(communicationId);
        const streamingPlaceholder = currentHistory.find((m: any) => m.status === MessageStatus.STREAMING);

        if (streamingPlaceholder) {
          await db.updateMessageStatus(streamingPlaceholder.id, {
            status: MessageStatus.ERRORED,
            errorMessage: error?.message || "Internal generation model lifecycle failure."
          });
        }

        socket.emit('error', { communicationId, message: "A model processing execution failure occurred." });
      }
      activeCancellations.delete(communicationId);
    }
  });

  /**
   * Event: cancel_generation
   * Expects: { communicationId: string }
   */
  socket.on('cancel_generation', (data) => {
    const { communicationId } = data;

    if (activeCancellations.has(communicationId)) {
      activeCancellations.get(communicationId)?.abort();
      activeCancellations.delete(communicationId);
    } else {
      socket.emit('warning', { message: "No operational streaming context found matching this communicationId." });
    }
  });

  socket.on('disconnect', () => {
    sdk_observer.trackLog('info', 'A user disconnected.' + socket.id, {timestamp: new Date().toISOString(),  userId: socket.id});
    console.log(`Socket connection disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
  console.log(`Server executing live on port ${PORT}`);
});