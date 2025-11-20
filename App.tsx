import React, { useState, useEffect, useRef } from 'react';
import { Message, Sender, AppSettings } from './types';
import { SendIcon, SettingsIcon, BotIcon } from './components/Icons';
import ProductCard from './components/ProductCard';
import ConfigurationView from './components/ConfigurationView';
import { searchProducts } from './services/geminiService';
import { saveMessages, loadMessages, saveSettings, loadSettings, clearHistory } from './services/storageService';

const App: React.FC = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ targetDomain: '', useMockData: false });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialization
  useEffect(() => {
    const savedMsgs = loadMessages();
    const savedConfig = loadSettings();
    
    setSettings(savedConfig);

    if (savedMsgs.length === 0) {
      setMessages([{
        id: 'welcome',
        text: "¡Hola! Soy ShopScout. Dime qué producto estás buscando (ej. 'Tenis para correr', 'Laptop gamer') y buscaré las mejores opciones para ti.",
        sender: Sender.BOT,
        timestamp: Date.now()
      }]);
    } else {
      setMessages(savedMsgs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom
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

    // Add placeholder loading message
    const loadingId = 'loading-' + Date.now();
    setMessages(prev => [...prev, {
      id: loadingId,
      text: "Buscando mejores ofertas...",
      sender: Sender.BOT,
      timestamp: Date.now(),
      isLoading: true
    }]);

    // Call Gemini Service with the full conversation history
    const result = await searchProducts(updatedMessages, settings.targetDomain);

    // Remove loading message and add actual response
    setMessages(prev => {
      const filtered = prev.filter(m => m.id !== loadingId);
      return [...filtered, {
        id: (Date.now() + 1).toString(),
        text: result.text,
        products: result.products,
        sender: Sender.BOT,
        timestamp: Date.now()
      }];
    });

    setIsLoading(false);
  };

  const handleSettingsSave = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  const handleClearHistory = () => {
    clearHistory();
    setMessages([{
        id: 'welcome-reset',
        text: "Historial borrado. ¿Qué buscas hoy?",
        sender: Sender.BOT,
        timestamp: Date.now()
      }]);
  };

  return (
    // Outer wrapper for desktop background centering
    <div className="w-full min-h-screen bg-slate-200 sm:flex sm:items-center sm:justify-center font-sans">
      
      {/* App Container - Full screen on mobile, Boxed phone-like on desktop */}
      <div className="relative flex flex-col w-full h-[100dvh] sm:h-[850px] sm:max-w-[420px] bg-slate-50 text-slate-900 sm:rounded-[30px] sm:shadow-2xl sm:border-[8px] sm:border-slate-800 overflow-hidden">
      
        {/* Header */}
        <header className="flex-none bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-10 shadow-sm">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <BotIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg leading-none text-indigo-900">ShopScout</h1>
              <p className="text-[10px] font-medium text-indigo-400 uppercase tracking-wider">AI Assistant</p>
            </div>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <SettingsIcon className="w-6 h-6" />
          </button>
        </header>

        {/* Chat Area */}
        <main className="flex-grow overflow-y-auto p-4 space-y-6">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.sender === Sender.USER ? 'items-end' : 'items-start'}`}
            >
              {/* Message Bubble */}
              <div 
                className={`
                  max-w-[85%] px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm
                  ${msg.sender === Sender.USER 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-white text-slate-700 border border-slate-200 rounded-bl-none'}
                `}
              >
                {msg.isLoading ? (
                  <div className="flex space-x-2 items-center h-5">
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                ) : (
                  msg.text
                )}
              </div>

              {/* Products Grid (Only for Bot) */}
              {msg.products && msg.products.length > 0 && (
                <div className="mt-4 w-full pl-2">
                  <div className="flex flex-col sm:flex-row sm:flex-wrap gap-4">
                    {msg.products.map((product, idx) => (
                      <ProductCard key={`${msg.id}-prod-${idx}`} product={product} />
                    ))}
                  </div>
                </div>
              )}
              
              <span className="text-[10px] text-slate-400 mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </main>

        {/* Input Area */}
        <footer className="flex-none bg-white border-t border-slate-200 p-4 pb-6 sm:pb-4">
          <div className="max-w-4xl mx-auto relative flex items-center">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="¿Qué estás buscando?"
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

        {/* Configuration View Overlay */}
        {isSettingsOpen && (
            <ConfigurationView 
              currentSettings={settings}
              onSave={handleSettingsSave}
              onBack={() => setIsSettingsOpen(false)}
              onClearHistory={handleClearHistory}
            />
        )}
      </div>
    </div>
  );
};

export default App;