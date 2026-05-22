// // import pkg from '@prisma/client';
// import { PrismaClient } from "../generated/prisma/client.js";
// import { PrismaPg } from "@prisma/adapter-pg";

// const connectionString = `${process.env.DATABASE_URL}`;
// const adapter = new PrismaPg({ connectionString });
// const prisma =  new PrismaClient({ adapter });

// function countWords(text = "") {
//   return text.trim().split(/\s+/).filter(Boolean).length;
// }

// // ─────────────────────────────────────────────
// // Store SDK Flush
// // ─────────────────────────────────────────────
// async function storeFlush({ payload, ip, receivedAt }) {
//   const { session, messages, sdkVersion, flushedAt } = payload;

//   const now = receivedAt;

//   try {
//     await prisma.$transaction(async (tx) => {
//       // 1. Upsert Session
//       await tx.session.upsert({
//         where: {
//           sessionId: session.sessionId,
//         },

//         update: {
//           userId: session.userId ?? "",
//           tags: JSON.stringify(session.tags ?? []),
//           attributes: JSON.stringify(session.attributes ?? {}),
//           sdkVersion,
//           lastSeenAt: BigInt(now),

//           messageCount: {
//             increment: messages.length,
//           },
//         },

//         create: {
//           sessionId: session.sessionId,
//           userId: session.userId ?? "",
//           tags: JSON.stringify(session.tags ?? []),
//           attributes: JSON.stringify(session.attributes ?? {}),
//           sdkVersion,

//           firstSeenAt: BigInt(now),
//           lastSeenAt: BigInt(now),

//           messageCount: messages.length,
//         },
//       });

//       // 2. Insert Messages
//       if (messages.length > 0) {
//         await tx.message.createMany({
//           data: messages.map((msg) => ({
//             sessionId: session.sessionId,

//             role: msg.role,
//             content: msg.content,

//             wordCount: countWords(msg.content),
//             charCount: msg.content.length,

//             msgTimestamp: BigInt(msg.timestamp ?? now),
//             ingestedAt: BigInt(now),

//             metadata: JSON.stringify(msg.metadata ?? {}),
//           })),
//         });
//       }

//       // 3. Audit Log
//       await tx.ingestionLog.create({
//         data: {
//           sessionId: session.sessionId,
//           sdkVersion,

//           messageCount: messages.length,

//           flushedAt: BigInt(flushedAt),
//           receivedAt: BigInt(now),

//           ip: ip ?? "",
//         },
//       });
//     });

//   } catch (err) {
//     throw new Error(`DB write failed: ${err.message}`);
//   }
// }

// // ─────────────────────────────────────────────
// // Queries
// // ─────────────────────────────────────────────
// const queries = {

//   async stats() {
//     const [
//       totalSessions,
//       totalMessages,
//       totalFlushes,
//     ] = await Promise.all([
//       prisma.session.count(),
//       prisma.message.count(),
//       prisma.ingestionLog.count(),
//     ]);

//     return {
//       total_sessions: totalSessions,
//       total_messages: totalMessages,
//       total_flushes: totalFlushes,
//     };
//   },

//   async byRole() {
//     const grouped = await prisma.message.groupBy({
//       by: ["role"],

//       _count: {
//         role: true,
//       },

//       _avg: {
//         wordCount: true,
//       },

//       _sum: {
//         wordCount: true,
//       },

//       orderBy: {
//         _count: {
//           role: "desc",
//         },
//       },
//     });

//     return grouped.map((r) => ({
//       role: r.role,
//       count: r._count.role,
//       avg_words: Number(r._avg.wordCount ?? 0).toFixed(1),
//       total_words: r._sum.wordCount ?? 0,
//     }));
//   },

//   async recentSessions(limit = 20) {
//     return prisma.session.findMany({
//       take: limit,

//       orderBy: {
//         lastSeenAt: "desc",
//       },

//       select: {
//         sessionId: true,
//         userId: true,
//         messageCount: true,

//         firstSeenAt: true,
//         lastSeenAt: true,
//       },
//     });
//   },

//   async sessionMessages(sessionId) {
//     return prisma.message.findMany({
//       where: {
//         sessionId,
//       },

//       orderBy: {
//         msgTimestamp: "asc",
//       },

//       select: {
//         role: true,
//         content: true,

//         wordCount: true,
//         charCount: true,

//         msgTimestamp: true,
//         metadata: true,
//       },
//     });
//   },

//   async messages(role, limit = 50) {
//     return prisma.message.findMany({
//       where: role
//         ? {
//             role,
//           }
//         : undefined,

//       take: limit,

//       orderBy: {
//         msgTimestamp: "desc",
//       },

//       select: {
//         sessionId: true,
//         role: true,
//         content: true,

//         wordCount: true,
//         charCount: true,

//         msgTimestamp: true,
//         metadata: true,
//       },
//     });
//   },

//   async ingestionLog(limit = 50) {
//     return prisma.ingestionLog.findMany({
//       take: limit,

//       orderBy: {
//         receivedAt: "desc",
//       },

//       select: {
//         sessionId: true,
//         sdkVersion: true,

//         messageCount: true,
//         ip: true,

//         flushedAt: true,
//         receivedAt: true,
//       },
//     });
//   },
// };

// export { prisma, storeFlush, queries };


// import pkg from '@prisma/client';
import { PrismaClient } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import dotenv from "dotenv";

dotenv.config();
const connectionString = `${process.env.DATABASE_URL}`;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function countWords(text = "") {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ─────────────────────────────────────────────
// Store SDK Flush
// ─────────────────────────────────────────────
async function storeFlush({ payload, ip, receivedAt }) {
  const { session, messages, sdkVersion, flushedAt } = payload;
  const now = receivedAt;

  try {
    // 1. Isolate the Session upsert out of the transactional array.
    // This removes heavy row-level deadlocks under parallel SDK flush traffic.
    await prisma.session.upsert({
      where: {
        sessionId: session.sessionId,
      },
      update: {
        userId: session.userId ?? "",
        tags: JSON.stringify(session.tags ?? []),
        attributes: JSON.stringify(session.attributes ?? {}),
        sdkVersion,
        lastSeenAt: BigInt(now),
        messageCount: {
          increment: messages.length,
        },
      },
      create: {
        sessionId: session.sessionId,
        userId: session.userId ?? "",
        tags: JSON.stringify(session.tags ?? []),
        attributes: JSON.stringify(session.attributes ?? {}),
        sdkVersion,
        firstSeenAt: BigInt(now),
        lastSeenAt: BigInt(now),
        messageCount: messages.length,
      },
    });

    // 2. Queue append-only records into an atomic batch operation array
    const batchOperations = [];

    if (messages.length > 0) {
      batchOperations.push(
        prisma.message.createMany({
          data: messages.map((msg) => ({
            sessionId: session.sessionId,
            role: msg.role,
            content: msg.content,
            wordCount: countWords(msg.content),
            charCount: msg.content.length,
            msgTimestamp: BigInt(msg.timestamp ?? now),
            ingestedAt: BigInt(now),
            metadata: JSON.stringify(msg.metadata ?? {}),
          })),
        })
      );
    }

    batchOperations.push(
      prisma.ingestionLog.create({
        data: {
          sessionId: session.sessionId,
          sdkVersion,
          messageCount: messages.length,
          flushedAt: BigInt(flushedAt),
          receivedAt: BigInt(now),
          ip: ip ?? "",
        },
      })
    );

    // 3. Execute inserts in a single high-speed database pulse
    await prisma.$transaction(batchOperations);

  } catch (err) {
    throw new Error(`DB write failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────
const queries = {

  async stats() {
    const [
      totalSessions,
      totalMessages,
      totalFlushes,
    ] = await Promise.all([
      prisma.session.count(), // Updated to use your seswsion model
      prisma.message.count(),
      prisma.ingestionLog.count(),
    ]);

    return {
      total_sessions: totalSessions,
      total_messages: totalMessages,
      total_flushes: totalFlushes,
    };
  },

  async byRole() {
    const grouped = await prisma.message.groupBy({
      by: ["role"],

      _count: {
        role: true,
      },

      _avg: {
        wordCount: true,
      },

      _sum: {
        wordCount: true,
      },

      orderBy: {
        _count: {
          role: "desc",
        },
      },
    });

    return grouped.map((r) => ({
      role: r.role,
      count: r._count.role,
      avg_words: Number(r._avg.wordCount ?? 0).toFixed(1),
      total_words: r._sum.wordCount ?? 0,
    }));
  },

  async recentSessions(limit = 20) {
    return prisma.session.findMany({ // Updated to use your session model
      take: limit,

      orderBy: {
        lastSeenAt: "desc",
      },

      select: {
        sessionId: true,
        userId: true,
        messageCount: true,
        firstSeenAt: true,
        lastSeenAt: true,
      },
    });
  },

  async sessionMessages(sessionId) {
    return prisma.message.findMany({
      where: {
        sessionId,
      },

      orderBy: {
        msgTimestamp: "asc",
      },

      select: {
        role: true,
        content: true,
        wordCount: true,
        charCount: true,
        msgTimestamp: true,
        metadata: true,
      },
    });
  },

  async messages(role, limit = 50) {
    return prisma.message.findMany({
      where: role
        ? {
            role,
          }
        : undefined,

      take: limit,

      orderBy: {
        msgTimestamp: "desc",
      },

      select: {
        sessionId: true,
        role: true,
        content: true,
        wordCount: true,
        charCount: true,
        msgTimestamp: true,
        metadata: true,
      },
    });
  },

  async ingestionLog(limit = 50) {
    return prisma.ingestionLog.findMany({
      take: limit,

      orderBy: {
        receivedAt: "desc",
      },

      select: {
        sessionId: true,
        sdkVersion: true,
        messageCount: true,
        ip: true,
        flushedAt: true,
        receivedAt: true,
      },
    });
  },
};

export { prisma, storeFlush, queries };