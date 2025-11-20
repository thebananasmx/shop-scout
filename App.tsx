import React, { useState, useEffect, useRef } from 'react';
import { Message, Sender, AppSettings, Source, Product } from './types';
import { SendIcon, SettingsIcon, BotIcon } from './components/Icons';
import ProductCard from './components/ProductCard';
import SettingsModal from './components/SettingsModal';
import { getSearchPlan, scrapeProductData } from './services/geminiService';
import { saveMessages, loadMessages, saveSettings, loadSettings, clearHistory } from './services/storageService';

const SourceCitations: React.FC<{ sources: Source[] }> = ({ sources }) => (
  <div className="mt-3 w-full pl-2">
    <p className="text-xs font-semibold text-slate-500 mb-1">Fuentes:</p>
    <ul className="list-disc list-inside space-y-1">
      {sources.slice(0, 3).map((source, index) => (
        <li key={index} className="text-xs text-slate-600 truncate">
          <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
            {source.title || new URL(source.uri).hostname}
          </a>
        </li>
      ))}
    </ul>
  </div>
);

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ useMockData: false });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedMsgs = loadMessages();
    const savedConfig = loadSettings();
    
    setSettings(savedConfig);

    if (savedMsgs.length === 0) {
      setMessages([{
        id: 'welcome',
        text: "¡Hola! Soy Scout. Pídeme recomendaciones de productos o hazme una pregunta. Exploraré la web para encontrar la mejor información para ti.",
        sender: Sender.BOT,
        timestamp: Date.now()
      }]);
    } else {
      setMessages(savedMsgs);
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    if (messages.length > 0) {
      saveMessages(messages);
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userText = inputValue.trim();
    setInputValue('');

    const userMessage: Message = {
      id: Date.now().toString(),
      text: userText,
      sender: Sender.USER,
      timestamp: Date.now()
    };
    
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsLoading(true);

    const loadingId = 'loading-' + Date.now();
    setMessages(prev => [...prev, {
      id: loadingId,
      text: "Pensando...",
      sender: Sender.BOT,
      timestamp: Date.now(),
      isLoading: true
    }]);

    try {
      // PHASE 1: Get the search plan (URLs or text response)
      const plan = await getSearchPlan(updatedMessages);
      
      setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: plan.responseText } : m));

      let finalProducts: Product[] = [];
      let finalSources: Source[] = plan.sources;
      let finalResponseText = plan.responseText;

      // PHASE 2: If we got URLs, scrape them for product data
      if (plan.isProductSearch && plan.productUrls.length > 0) {
         setMessages(prev => prev.map(m => m.id === loadingId ? { ...m, text: "Analizando páginas de productos..." } : m));
         finalProducts = await scrapeProductData(plan.productUrls);
         if (finalProducts.length === 0) {
           finalResponseText = "Lo siento, no pude extraer detalles de las páginas que encontré. ¿Podrías intentar con una búsqueda más específica?";
         } else {
           finalResponseText = `¡Listo! Encontré ${finalProducts.length} producto(s) relevante(s) para ti:`;
         }
      }

      // Final Step: Replace loading message with the final result
      setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        return [...filtered, {
          id: (Date.now() + 1).toString(),
          text: finalResponseText,
          products: finalProducts,
          sources: finalSources,
          sender: Sender.BOT,
          timestamp: Date.now()
        }];
      });

    } catch (error) {
       setMessages(prev => {
        const filtered = prev.filter(m => m.id !== loadingId);
        return [...filtered, {
          id: (Date.now() + 1).toString(),
          text: "Hubo un error al procesar tu solicitud. Por favor, intenta de nuevo.",
          sender: Sender.BOT,
          timestamp: Date.now()
        }];
      });
    }

    setIsLoading(false);
  };

  const handleClearHistory = () => {
    clearHistory();
    setMessages([{
        id: 'welcome-reset',
        text: "Historial borrado. ¿En qué puedo ayudarte?",
        sender: Sender.BOT,
        timestamp: Date.now()
      }]);
  };

  return (
    <div className="w-full min-h-screen bg-slate-200 sm:flex sm:items-center sm:justify-center font-sans">
      <div className="relative flex flex-col w-full h-[100dvh] sm:h-[850px] sm:max-w-[420px] bg-slate-50 text-slate-900 sm:rounded-[30px] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 overflow-hidden">
        <header className="flex-none bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <BotIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none text-indigo-900">Scout</h1>
              <p className="text-[10px] font-medium text-indigo-400 uppercase tracking-wider">AI Search Assistant</p>
            </div>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <SettingsIcon className="w-6 h-6" />
          </button>
        </header>

        <main className="flex-grow overflow-y-auto p-4 space-y-6">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.sender === Sender.USER ? 'items-end' : 'items-start'}`}
            >
              <div 
                className={`
                  max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm
                  ${msg.sender === Sender.USER 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'}
                `}
              >
                {msg.isLoading ? (
                   <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-pulse"></div>
                    <span className="text-slate-500 text-xs italic">{msg.text}</span>
                  </div>
                ) : (
                  msg.text
                )}
              </div>
              
              {msg.products && msg.products.length > 0 && (
                <div className="mt-4 w-full">
                  <div className="flex overflow-x-auto gap-4 pb-4 -ml-2 pl-2">
                    {msg.products.map((product, idx) => (
                      <div key={`${msg.id}-prod-${idx}`} className="flex-shrink-0 w-[85%] max-w-xs">
                        <ProductCard product={product} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {msg.sources && msg.sources.length > 0 && !msg.products?.length && (
                 <SourceCitations sources={msg.sources} />
              )}
              
              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </main>

        <footer className="flex-none bg-white border-t border-slate-200 p-4 pb-6 sm:pb-4">
          <div className="max-w-4xl mx-auto relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Pregúntame cualquier cosa..."
              disabled={isLoading}
              className="w-full bg-slate-100 text-slate-800 placeholder-slate-400 rounded-full pl-5 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all shadow-inner text-base"
            />
            <button 
              onClick={handleSendMessage}
              disabled={!inputValue.trim() || isLoading}
              className="absolute right-2 bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-all shadow-md"
            >
              <SendIcon className="w-5 h-5" />
            </button>
          </div>
        </footer>

        <SettingsModal 
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onClearHistory={handleClearHistory}
        />
      </div>
    </div>
  );
};

export default App;
