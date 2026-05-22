import { useState, useRef, useEffect } from "react";
import { useQuerryContext } from "./contextProvider.jsx";
import { X, Mic, Send } from "lucide-react";
import me from "./assets/me.jpg"
import ReactMarkdown from "react-markdown";

// Chatbot Component
const suggestedQuestions = [
  "Tell me about your experience",
  "What projects have you worked on?",
  "What are your technical skills?",
  "How can I contact you?"
];

export default function Chatbot({ onClose }) {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const { 
    session, 
    createSession,
    setSession,
    getMessages,
    resetSession,
    sendMessage
  } = useQuerryContext();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Initialize session and load messages
  useEffect(() => {
    const calling = async () => {
      // Get session
      await new Promise(async (res) => {
        if (session) {
          res(session);
        } else {
          // Get a new session
          const data = await createSession();
          // Set the session in the localStorage
          setSession(data.sessionId);
          res(data.sessionId);
        }
      })
      .then(async (sessionId) => {
        // Now fetch the messages
        const fetchedMessages = await getMessages(sessionId);
        if (fetchedMessages.status) {
          if (fetchedMessages.messages.length > 0) setShowWelcome(false);
          return fetchedMessages.messages;
        }
        // Reinitialize the session, delete session
        resetSession();
        throw Error("Session Invalid");
      })
      .then((messages_loc) => {
        setMessages(messages_loc);
      })
      .catch((e) => {
        console.error("Failed to load, Error:", e);
      });
    };
    calling();
  }, []);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    
    const content = inputValue;
    setInputValue('');
    setShowWelcome(false);
    setIsTyping(true);

    // Append my message to list
    setMessages((prev) => {
      const lastId = prev.length ? prev[prev.length - 1].id : 0;
      return [
        ...prev,
        {
          role: "USER",
          content,
          createdAt: new Date().toISOString(),
          id: lastId + 1,
        },
      ];
    });

    new Promise(async (rej) => {
      // Will fetch and will move forward to updating the data
      if (session == null) {
        console.info("Wait for session to be init.");
        rej("failed to resolve");
        return;
      }
      const res_message = await sendMessage(session, content);
      if (res_message.status) {
        // Update the queue
        setMessages((prev) => {
          const lastId = prev.length ? prev[prev.length - 1].id : 0;

          return [
            ...prev,
            {
              role: "BOT",
              content: res_message.response,
              createdAt: new Date().toISOString(),
              id: lastId + 1,
            },
          ];
        });
      } else {
        console.info("Failed to generate a response!!");
        console.error(res_message);
      }
      setIsTyping(false);
    });
  };

  const handleSuggestionClick = (question) => {
    setInputValue(question);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Chat Container */}
      <div className="relative w-full h-full sm:h-[600px] sm:max-w-md sm:rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
               <img src={me} className="rounded-full text-gray-700" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 font-mono">Priyanshu's Portfolio Assistant</h3>
              <p className="text-xs text-green-600 flex items-center gap-1">
                <span className="w-2 h-2 bg-green-600 rounded-full animate-pulse" />
                Online
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {showWelcome && (
            <div className="flex justify-start">
              <div className="max-w-[80%] bg-white text-gray-900 border border-gray-200 rounded-2xl px-4 py-3">
                <p className="text-sm whitespace-pre-wrap font-mono">
                  Hello! 👋{'\n\n'}
                  Welcome to  assistant. I can help you learn more about my experience, projects, and skills. Feel free to ask me anything!
                </p>
              </div>
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'USER' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  message.role === 'USER'
                    ? 'bg-gray-900 text-white'
                    : 'bg-white text-gray-900 border border-gray-200'
                }`}
              >
                <p className="text-sm whitespace-pre-wrap font-mono"><ReactMarkdown>{message.content}</ReactMarkdown></p>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}

          {/* Suggested Questions */}
          {showWelcome && messages.length === 0 && (
            <div className="pt-2 space-y-2">
              <p className="text-xs text-gray-500 font-mono px-2">Suggested questions:</p>
              {suggestedQuestions.map((question, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(question)}
                  className="w-full text-left px-4 py-2 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors text-sm font-mono text-gray-700"
                >
                  <span className="text-gray-400 mr-2">💬</span>
                  {question}
                </button>
              ))}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="flex items-end gap-2">
            
            <div className="flex-1 relative">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything..."
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-gray-900 font-mono text-sm"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!inputValue.trim()}
              className="p-3 bg-gray-900 text-white rounded-full hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
              aria-label="Send message"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
