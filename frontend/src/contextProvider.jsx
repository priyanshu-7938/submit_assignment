import { createContext, useContext, useState} from "react";

const QuerryContext = createContext(null);

const BASE_URL = import.meta.env.VITE_API_URL;

const ContextProvider = ({children})=>{

    const [ session, setSess ] = useState(localStorage.getItem('session-string'));

    async function request(endpoint, options) {
        const res = await fetch(`${endpoint}`, {
        headers: { "Content-Type": "application/json" },
        ...options,
        });

        if (!res.ok) {
            const error = await res.text();
            throw new Error(error || `API Error: ${res.statusText}`);
        }
        return res.json();
    }

    function setSession(sessionString) {
        localStorage.setItem('session-string', sessionString);
        setSess(sessionString);
    }

    function refressSession() {
        const val = localStorage.getItem('session-string');
        if( val != session){
            setSess(val);
        }
    }

    function resetSession() {
        localStorage.removeItem('session-string');
        setSess(null);
    }


    async function createSession() {
        return request(`${BASE_URL}/createsession`, { method: "GET" });
    }

    async function sendMessage(sessionId, message){
        return request(`${BASE_URL}/chat/message`, {
        method: "POST",
        body: JSON.stringify({ sessionId, message }),
        });
    }

    async function getMessages(sessionId) {
        return request(`${BASE_URL}/messages`, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
        });
    }

    return(
        <QuerryContext.Provider value = {{
            createSession,
            getMessages,
            sendMessage,
            setSession,
            refressSession,
            resetSession,
            session
        }}>
            {children}
        </QuerryContext.Provider>
    )
} 


export default ContextProvider;
export const useQuerryContext = () => {
  const ctx = useContext(QuerryContext);
  if (!ctx) {
    throw new Error("useQuerryContext must be used inside ContextProvider");
  }
  return ctx;
};