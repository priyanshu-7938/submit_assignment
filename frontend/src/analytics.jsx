// import { useState, useEffect, useRef } from "react";
// import { 
//   Activity, 
//   Database, 
//   MessageSquare, 
//   Terminal, 
//   Clock, 
//   RefreshCw, 
//   User, 
//   Cpu, 
//   Server,
//   ArrowRight
// } from "lucide-react";

// const BASE_URL = import.meta.env.VITE_API_URL_FOR_DATA || "http://localhost:4000";

// export default function LiveAnalytics() {
//   // Core API State Holders
//   const [stats, setStats] = useState({ totals: { messages: 0, sessions: 0 }, by_role: {} });
//   const [sessions, setSessions] = useState([]);
//   const [selectedSessionId, setSelectedSessionId] = useState("");
//   const [activeConversation, setActiveConversation] = useState(null);
//   const [auditLogs, setAuditLogs] = useState([]);
  
//   // App UI Controls
//   const [isLive, setIsLive] = useState(true);
//   const [loading, setLoading] = useState(true);
//   const [serverStatus, setServerStatus] = useState("checking"); // 'online' | 'offline' | 'checking'
//   const liveInterval = useRef(null);

//   // Core Aggregator: Hits the exact endpoints from your server.js
//   const fetchLatestMetrics = async () => {
//     try {
//       const [statsRes, sessionsRes, logsRes, healthRes] = await Promise.all([
//         fetch(`${BASE_URL}/api/stats`).then((r) => r.json()),
//         fetch(`${BASE_URL}/api/sessions?limit=15`).then((r) => r.json()),
//         fetch(`${BASE_URL}/api/log?limit=30`).then((r) => r.json()),
//         fetch(`${BASE_URL}/health`).then((r) => r.json()).catch(() => null)
//       ]);

//       if (statsRes) setStats(statsRes);
//       if (sessionsRes) setSessions(sessionsRes);
//       if (logsRes) setAuditLogs(logsRes);
//       setServerStatus(healthRes?.status === "ok" ? "online" : "offline");
//       console.log("Latest metrics fetched:");
//       console.log({ stats: statsRes, sessions: sessionsRes, logs: logsRes, health: healthRes });
//       setLoading(false);
//     } catch (err) {
//       console.error("Metrics aggregation cycle failed:", err);
//       setServerStatus("offline");
//     }
//   };

//   // Inspect dynamic deep historical arrays for an isolated session
//   const inspectSession = async (id) => {
//     try {
//       setSelectedSessionId(id);
//       const res = await fetch(`${BASE_URL}/api/sessions/${id}`).then((r) => r.json());
//       // Maps directly to: res.json({ session_id: ..., messages: rows })
//       if (res && res.messages) {
//         setActiveConversation(res.messages);
//       }
//     } catch (err) {
//       console.error("Could not fetch explicit session path:", err);
//     }
//   };

//   // Live stream orchestration setup
//   useEffect(() => {
//     fetchLatestMetrics();

//     if (isLive) {
//       liveInterval.current = setInterval(fetchLatestMetrics, 3000); // Poll every 3 seconds
//     }

//     return () => {
//       if (liveInterval.current) clearInterval(liveInterval.current);
//     };
//   }, [isLive]);

//   // Live-polling sub-cycle for open inspection panels
//   useEffect(() => {
//     let sessionInterval;
//     if (isLive && selectedSessionId) {
//       sessionInterval = setInterval(() => inspectSession(selectedSessionId), 3000);
//     }
//     return () => clearInterval(sessionInterval);
//   }, [selectedSessionId, isLive]);

//   if (loading) {
//     return (
//       <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-950 font-mono text-xs text-slate-400 gap-3">
//         <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
//         <span>MOUNTING LIVE METRICS HUD PIPELINE...</span>
//       </div>
//     );
//   }

//   return (
//     <div className="bg-slate-950 text-slate-100 min-h-screen p-6 font-mono selection:bg-emerald-500 selection:text-black">
      
//       {/* HUD Controller Strip */}
//       <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
//         <div>
//           <div className="flex items-center gap-2">
//             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
//             <h1 className="text-md font-bold tracking-wider uppercase text-slate-200">
//               Ingest Tracker & Realtime Stream Hub
//             </h1>
//           </div>
//           <p className="text-[11px] text-slate-500 mt-1">
//             Listening on address: <span className="text-slate-400">{BASE_URL}</span>
//           </p>
//         </div>

//         <div className="flex items-center gap-3 text-xs self-start md:self-center">
//           {/* Server Engine Pulse Indicator */}
//           <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
//             serverStatus === "online" 
//               ? "bg-emerald-950/30 border-emerald-800 text-emerald-400" 
//               : "bg-rose-950/30 border-rose-950 text-rose-400"
//           }`}>
//             <Server className="w-3.5 h-3.5" />
//             <span className="uppercase text-[10px] tracking-widest font-bold">
//               {serverStatus === "online" ? "NODE ONLINE" : "NODE DISCONNECTED"}
//             </span>
//           </div>

//           {/* Toggle Engine Polling Mode */}
//           <button
//             onClick={() => setIsLive(!isLive)}
//             className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition uppercase text-[10px] tracking-wider font-bold ${
//               isLive 
//                 ? "bg-slate-900 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
//                 : "bg-slate-900 border-slate-800 text-slate-500"
//             }`}
//           >
//             <Activity className={`w-3.5 h-3.5 ${isLive ? "animate-pulse" : ""}`} />
//             {isLive ? "LIVE STREAM ON" : "STREAM PAUSED"}
//           </button>
//         </div>
//       </header>

//       {/* Grid Block 1: Running Quantities */}
//       <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
//         <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
//           <div className="absolute right-3 top-3 text-slate-800"><MessageSquare className="w-12 h-12 stroke-[1]" /></div>
//           <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Total Packets</p>
//           <h3 className="text-2xl font-bold text-slate-200 mt-1">{stats?.totals?.messages ?? 0}</h3>
//           <p className="text-[9px] text-slate-600 mt-1">Processed count in storage.</p>
//         </div>

//         <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
//           <div className="absolute right-3 top-3 text-slate-800"><Clock className="w-12 h-12 stroke-[1]" /></div>
//           <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Tracked Sessions</p>
//           <h3 className="text-2xl font-bold text-slate-200 mt-1">{stats?.totals?.sessions ?? 0}</h3>
//           <p className="text-[9px] text-slate-600 mt-1">Unique session identifiers.</p>
//         </div>

//         {/* Dynamic Mapping Across Your Server Roles: User and Assistant balance */}
//         <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
//           <div className="absolute right-3 top-3 text-slate-800"><User className="w-12 h-12 stroke-[1]" /></div>
//           <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">User Content</p>
//           <h3 className="text-2xl font-bold text-slate-200 mt-1">{stats?.by_role?.user ?? 0}</h3>
//           <p className="text-[9px] text-slate-600 mt-1">Inbound conversational strings.</p>
//         </div>

//         <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
//           <div className="absolute right-3 top-3 text-slate-800"><Cpu className="w-12 h-12 stroke-[1]" /></div>
//           <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Assistant Outputs</p>
//           <h3 className="text-2xl font-bold text-slate-200 mt-1">
//             {(stats?.by_role?.assistant ?? 0) + (stats?.by_role?.system ?? 0) + (stats?.by_role?.tool ?? 0)}
//           </h3>
//           <p className="text-[9px] text-slate-600 mt-1">System, Tool & Core completions.</p>
//         </div>
//       </section>

//       {/* Grid Block 2: Live Conversation & Sessions Stream */}
//       <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        
//         {/* Left Side (5 Cols): Live Session Ledger */}
//         <div className="bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col h-[450px] lg:col-span-5">
//           <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 rounded-t-xl">
//             <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
//               <Database className="w-3.5 h-3.5 text-blue-400" /> Active Session Logs
//             </span>
//             <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
//               {sessions.length} Open
//             </span>
//           </div>

//           <div className="flex-1 overflow-y-auto divide-y divide-slate-900">
//             {sessions.length === 0 ? (
//               <div className="text-center py-20 text-slate-600 text-xs italic">
//                 No indexed server histories found.
//               </div>
//             ) : (
//               sessions.map((sess, idx) => {
//                 // Adjust dynamically whether session records are native strings or objects
//                 const currentId = typeof sess === "string" ? sess : sess.sessionId || sess.id;
//                 const isSelected = selectedSessionId === currentId;

//                 return (
//                   <button
//                     key={idx}
//                     onClick={() => inspectSession(currentId)}
//                     className={`w-full text-left px-4 py-3 text-xs transition relative flex items-center justify-between group ${
//                       isSelected 
//                         ? "bg-slate-900 font-bold border-l-2 border-emerald-500 text-white" 
//                         : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
//                     }`}
//                   >
//                     <div className="truncate pr-4 flex-1">
//                       <p className="font-mono text-[11px] text-slate-300 truncate">ID: {currentId}</p>
//                       <p className="text-[9px] text-slate-500 mt-1 flex items-center gap-2">
//                         <span>Index Slot: #{idx + 1}</span>
//                         {sess.msgCount && <span>• {sess.msgCount} messages</span>}
//                       </p>
//                     </div>
//                     <ArrowRight className={`w-3.5 h-3.5 transition shrink-0 ${
//                       isSelected ? "text-emerald-400 opacity-100" : "text-slate-700 opacity-0 group-hover:opacity-100"
//                     }`} />
//                   </button>
//                 );
//               })
//             )}
//           </div>
//         </div>

//         {/* Right Side (7 Cols): Context Inspector Terminal */}
//         <div className="bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col h-[450px] lg:col-span-7">
//           <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 rounded-t-xl text-xs font-bold uppercase tracking-wider text-slate-400">
//             Context Inspector: {selectedSessionId ? `${selectedSessionId.slice(0, 16)}...` : "Select a Stream"}
//           </div>
          
//           <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/30">
//             {activeConversation ? (
//               activeConversation.map((msg, idx) => {
//                 const isUser = msg.role === "user" || msg.role === "USER";
//                 return (
//                   <div 
//                     key={idx} 
//                     className={`p-3 rounded-lg border text-xs max-w-[90%] transition ${
//                       isUser 
//                         ? "bg-slate-900 border-slate-700 ml-auto text-slate-200" 
//                         : "bg-slate-900/80 border-slate-800 mr-auto text-slate-300"
//                     }`}
//                   >
//                     <div className="flex items-center justify-between text-[9px] uppercase tracking-wider font-bold opacity-50 mb-1 border-b border-slate-800/60 pb-1">
//                       <span className={isUser ? "text-blue-400" : "text-emerald-400"}>
//                         {msg.role}
//                       </span>
//                       {msg.timestamp && <span>{new Date(msg.timestamp).toLocaleTimeString()}</span>}
//                     </div>
//                     <p className="whitespace-pre-wrap leading-relaxed mt-1.5">{msg.content || msg.text || JSON.stringify(msg)}</p>
//                   </div>
//                 );
//               })
//             ) : (
//               <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs italic space-y-2">
//                 <Terminal className="w-5 h-5 text-slate-700 stroke-[1.5]" />
//                 <span>Select a running pipeline trace to query conversation states.</span>
//               </div>
//             )}
//           </div>
//         </div>

//       </section>

//       {/* Grid Block 3: SDK Ingestion Audit Log Trail */}
//       <footer className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-4">
//         <div className="flex items-center justify-between font-bold text-xs text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-900">
//           <span className="flex items-center gap-2">
//             <Terminal className="w-3.5 h-3.5 text-orange-500 animate-pulse" /> 
//             Live Ingestion Audit Trail (`/api/log`)
//           </span>
//           {isLive && <span className="text-[9px] text-emerald-400/70 lowercase animate-pulse">polling backend pipeline...</span>}
//         </div>
        
//         <div className="h-44 overflow-y-auto text-[11px] font-mono space-y-1.5 bg-black/40 p-4 rounded-lg border border-slate-900 text-slate-400">
//           {auditLogs.length > 0 ? (
//             auditLogs.map((log, i) => (
//               <div key={i} className="py-1 border-b border-slate-900/40 last:border-0 flex items-start gap-2 leading-relaxed">
//                 <span className="text-slate-600 shrink-0 select-none">
//                   [{log.receivedAt ? new Date(log.receivedAt).toLocaleTimeString() : new Date().toLocaleTimeString()}]
//                 </span>
//                 <span className="text-slate-500 shrink-0 font-semibold">[IP: {log.ip || "127.0.0.1"}]</span>
//                 <span className="text-slate-300 flex-1 break-all">
//                   {typeof log === "string" ? log : log.payload ? `Ingested payload for session: ${log.payload.session?.sessionId || "unknown"}` : JSON.stringify(log)}
//                 </span>
//               </div>
//             ))
//           ) : (
//             <div className="text-slate-600 italic py-4 text-center">
//               No runtime records recorded across the telemetry sink yet.
//             </div>
//           )}
//         </div>
//       </footer>

//     </div>
//   );
// }


import { useState, useEffect, useRef } from "react";
import { 
  Activity, 
  Database, 
  MessageSquare, 
  Terminal, 
  Clock, 
  RefreshCw, 
  User, 
  Cpu, 
  Server,
  ArrowRight
} from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL_FOR_DATA || "http://localhost:4000";

export default function LiveAnalytics() {
  // Core API State Holders
  const [stats, setStats] = useState({ total_sessions: 0, total_messages: 0, total_flushes: 0 });
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [activeConversation, setActiveConversation] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  
  // App UI Controls
  const [isLive, setIsLive] = useState(true);
  const [loading, setLoading] = useState(true);
  const [serverStatus, setServerStatus] = useState("checking"); // 'online' | 'offline' | 'checking'
  const liveInterval = useRef(null);

  // Core Aggregator: Hits the exact endpoints from your server.js
  const fetchLatestMetrics = async () => {
    try {
      const [statsRes, sessionsRes, logsRes, healthRes] = await Promise.all([
        fetch(`${BASE_URL}/api/stats`).then((r) => r.json()),
        fetch(`${BASE_URL}/api/sessions?limit=15`).then((r) => r.json()),
        fetch(`${BASE_URL}/api/log?limit=30`).then((r) => r.json()),
        fetch(`${BASE_URL}/health`).then((r) => r.json()).catch(() => null)
      ]);

      if (statsRes) setStats(statsRes);
      if (sessionsRes) setSessions(sessionsRes);
      if (logsRes) setAuditLogs(logsRes);
      setServerStatus(healthRes?.status === "ok" ? "online" : "offline");
      setLoading(false);
    } catch (err) {
      console.error("Metrics aggregation cycle failed:", err);
      setServerStatus("offline");
    }
  };

  // Inspect specific conversations via your server's GET /api/sessions/:id path
  const inspectSession = async (id) => {
    try {
      setSelectedSessionId(id);
      const res = await fetch(`${BASE_URL}/api/sessions/${id}`).then((r) => r.json());
      
      // Handle cases where the endpoint returns either the raw array or a wrapped object
      if (Array.isArray(res)) {
        setActiveConversation(res);
      } else if (res && res.messages) {
        setActiveConversation(res.messages);
      } else {
        setActiveConversation([]);
      }
    } catch (err) {
      console.error("Could not fetch explicit session path:", err);
    }
  };

  // Live stream orchestration setup
  useEffect(() => {
    fetchLatestMetrics();

    if (isLive) {
      liveInterval.current = setInterval(fetchLatestMetrics, 3000); // Poll every 3 seconds
    }

    return () => {
      if (liveInterval.current) clearInterval(liveInterval.current);
    };
  }, [isLive]);

  // Live-polling sub-cycle for open inspection panels
  useEffect(() => {
    let sessionInterval;
    if (isLive && selectedSessionId) {
      sessionInterval = setInterval(() => inspectSession(selectedSessionId), 3000);
    }
    return () => clearInterval(sessionInterval);
  }, [selectedSessionId, isLive]);

  // Convert schema BigInt safely to timestamp strings for display
  const formatDbTimestamp = (bigIntOrString) => {
    if (!bigIntOrString) return "N/A";
    try {
      const ms = typeof bigIntOrString === "bigint" ? Number(bigIntOrString) : Number(bigIntOrString);
      return new Date(ms).toLocaleTimeString();
    } catch {
      return "Format Err";
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-slate-950 font-mono text-xs text-slate-400 gap-3">
        <RefreshCw className="w-5 h-5 animate-spin text-emerald-400" />
        <span>MOUNTING LIVE METRICS HUD PIPELINE...</span>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen p-6 font-mono selection:bg-emerald-500 selection:text-black">
      
      {/* HUD Controller Strip */}
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-6 mb-6 border-b border-slate-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isLive ? "bg-emerald-500 animate-ping" : "bg-amber-500"}`} />
            <h1 className="text-md font-bold tracking-wider uppercase text-slate-200">
              Ingest Tracker & Realtime Stream Hub
            </h1>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Listening on address: <span className="text-slate-400">{BASE_URL}</span>
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs self-start md:self-center">
          {/* Server Engine Pulse Indicator */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-md border ${
            serverStatus === "online" 
              ? "bg-emerald-950/30 border-emerald-800 text-emerald-400" 
              : "bg-rose-950/30 border-rose-950 text-rose-400"
          }`}>
            <Server className="w-3.5 h-3.5" />
            <span className="uppercase text-[10px] tracking-widest font-bold">
              {serverStatus === "online" ? "NODE ONLINE" : "NODE DISCONNECTED"}
            </span>
          </div>

          {/* Toggle Engine Polling Mode */}
          <button
            onClick={() => setIsLive(!isLive)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md border transition uppercase text-[10px] tracking-wider font-bold ${
              isLive 
                ? "bg-slate-900 border-emerald-500/50 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                : "bg-slate-900 border-slate-800 text-slate-500"
            }`}
          >
            <Activity className={`w-3.5 h-3.5 ${isLive ? "animate-pulse" : ""}`} />
            {isLive ? "LIVE STREAM ON" : "STREAM PAUSED"}
          </button>
        </div>
      </header>

      {/* Grid Block 1: Running Quantities
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute right-3 top-3 text-slate-800"><MessageSquare className="w-12 h-12 stroke-[1]" /></div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Total Packets / Messages</p>
          <h3 className="text-2xl font-bold text-slate-200 mt-1">{stats?.total_messages ?? 0}</h3>
          <p className="text-[9px] text-slate-600 mt-1">Processed count in storage engine.</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute right-3 top-3 text-slate-800"><Clock className="w-12 h-12 stroke-[1]" /></div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Tracked Sessions</p>
          <h3 className="text-2xl font-bold text-slate-200 mt-1">{stats?.total_sessions ?? 0}</h3>
          <p className="text-[9px] text-slate-600 mt-1">Unique session identifiers.</p>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="absolute right-3 top-3 text-slate-800"><Database className="w-12 h-12 stroke-[1]" /></div>
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">Ingestion Flushes</p>
          <h3 className="text-2xl font-bold text-slate-200 mt-1">{stats?.total_flushes ?? 0}</h3>
          <p className="text-[9px] text-slate-600 mt-1">SDK block write updates committed.</p>
        </div>
      </section> */}

      {/* Grid Block 2: Live Conversation & Sessions Stream */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
        
        {/* Left Side (5 Cols): Live Session Ledger */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col h-[520px] lg:col-span-5">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 rounded-t-xl">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Database className="w-3.5 h-3.5 text-blue-400" /> Active Session Logs
            </span>
            <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
              {sessions.length} Synced
            </span>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-900">
            {console.log("Rendering sessions list:", sessions)}
            {sessions.length === 0 ? (
              <div className="text-center py-20 text-slate-600 text-xs italic">
                No indexed server histories found.
              </div>
            ) : (
              sessions.map((sess, idx) => {
                const currentId = sess.sessionId || sess.id;
                const isSelected = selectedSessionId === currentId;

                return (
                  <button
                    key={currentId || idx}
                    onClick={() => inspectSession(currentId)}
                    className={`w-full text-left px-4 py-3 text-xs transition relative flex items-center justify-between group ${
                      isSelected 
                        ? "bg-slate-900 font-bold border-l-2 border-emerald-500 text-white" 
                        : "text-slate-400 hover:bg-slate-900/50 hover:text-slate-200"
                    }`}
                  >
                    <div className="truncate pr-4 flex-1">
                      <div className="flex justify-between items-center w-full">
                        <p className="font-mono text-[11px] text-slate-300 truncate max-w-[70%]">ID: {currentId}</p>
                        <span className="text-[9px] text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded font-semibold shrink-0">
                          {sess.messageCount ?? 0} msgs
                        </span>
                      </div>
                      <p className="text-[9px] text-slate-500 mt-1.5 flex items-center gap-2 truncate">
                        <span>User: {sess.userId || "anonymous"}</span>
                        <span>•</span>
                        <span>Seen: {formatDbTimestamp(sess.lastSeenAt)}</span>
                      </p>
                    </div>
                    <ArrowRight className={`w-3.5 h-3.5 transition shrink-0 ml-1 ${
                      isSelected ? "text-emerald-400 opacity-100" : "text-slate-700 opacity-0 group-hover:opacity-100"
                    }`} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Side (7 Cols): Context Inspector Terminal */}
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl flex flex-col h-[520px] lg:col-span-7">
          <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 rounded-t-xl text-xs font-bold uppercase tracking-wider text-slate-400 flex justify-between items-center">
            <span>Context Inspector: {selectedSessionId ? `${selectedSessionId.slice(0, 16)}...` : "Select a Stream"}</span>
            {selectedSessionId && (
              <span className="text-[10px] text-emerald-400 font-mono normal-case">
                active pipeline trace
              </span>
            )}
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-950/30">
            {activeConversation ? (
              activeConversation.length === 0 ? (
                <div className="text-center py-20 text-slate-600 text-xs italic">
                  This session exists but contains no messages yet.
                </div>
              ) : (
                activeConversation.map((msg, idx) => {
                  const roleNormalized = (msg.role || "user").toLowerCase();
                  const isUser = roleNormalized === "user";
                  
                  return (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg border text-xs max-w-[90%] transition ${
                        isUser 
                          ? "bg-slate-900 border-slate-700 ml-auto text-slate-200" 
                          : "bg-slate-900/80 border-slate-800 mr-auto text-slate-300"
                      }`}
                    >
                      <div className="flex items-center justify-between text-[9px] uppercase tracking-wider font-bold opacity-50 mb-1 border-b border-slate-800/60 pb-1 gap-8">
                        <span className={isUser ? "text-blue-400" : "text-emerald-400"}>
                          {msg.role}
                        </span>
                        <span className="text-slate-500 font-normal">
                          {msg.wordCount ? `${msg.wordCount} words` : ""} {formatDbTimestamp(msg.msgTimestamp)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed mt-1.5 font-sans">
                        {msg.content || msg.text || JSON.stringify(msg)}
                      </p>
                    </div>
                  );
                })
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 text-xs italic space-y-2">
                <Terminal className="w-5 h-5 text-slate-700 stroke-[1.5]" />
                <span>Select a running pipeline trace to query conversation states.</span>
              </div>
            )}
          </div>
        </div>

      </section>

      {/* Grid Block 3: SDK Ingestion Audit Log Trail */}
      <footer className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden p-4">
        <div className="flex items-center justify-between font-bold text-xs text-slate-400 uppercase tracking-wider mb-3 pb-2 border-b border-slate-900">
          <span className="flex items-center gap-2">
            <Terminal className="w-3.5 h-3.5 text-orange-500" /> 
            Live Ingestion Audit Trail (`/api/log`)
          </span>
          {isLive && <span className="text-[9px] text-emerald-400/70 lowercase animate-pulse">polling backend pipeline...</span>}
        </div>
        
        <div className="h-44 overflow-y-auto text-[11px] font-mono space-y-1.5 bg-black/40 p-4 rounded-lg border border-slate-900 text-slate-400">
          {auditLogs.length > 0 ? (
            auditLogs.map((log, i) => (
              <div key={log.id || i} className="py-1 border-b border-slate-900/40 last:border-0 flex items-start gap-2 leading-relaxed">
                <span className="text-slate-600 shrink-0 select-none">
                  [{formatDbTimestamp(log.receivedAt)}]
                </span>
                <span className="text-slate-500 shrink-0 font-semibold">[IP: {log.ip || "127.0.0.1"}]</span>
                <span className="text-slate-300 flex-1 break-all">
                  {log.sessionId ? `Ingested pipeline activity for session ID: ${log.sessionId}` : JSON.stringify(log)}
                  {log.sdkVersion && <span className="text-slate-600 text-[10px] ml-2">({log.sdkVersion})</span>}
                </span>
              </div>
            ))
          ) : (
            <div className="text-slate-600 italic py-4 text-center">
              No runtime records recorded across the telemetry sink yet.
            </div>
          )}
        </div>
      </footer>

    </div>
  );
}