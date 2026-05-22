import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ContextProvider from "./contextProvider.jsx";
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import LiveAnalytics from "./analytics.jsx";

createRoot(document.getElementById('root')).render(
  <ContextProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App onClose={true}/>} />
        <Route path="/analytics" element={<LiveAnalytics />} />
      </Routes>
    </BrowserRouter>
  </ContextProvider>,
)
