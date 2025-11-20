import React, { useState } from 'react';
import { AppSettings, SiteScrapeResult } from '../types';
import { validateAndScrapeSite } from '../services/geminiService';

interface ConfigurationViewProps {
  currentSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onBack: () => void;
  onClearHistory: () => void;
}

const ConfigurationView: React.FC<ConfigurationViewProps> = ({ 
  currentSettings, 
  onSave, 
  onBack, 
  onClearHistory 
}) => {
  const [domain, setDomain] = useState(currentSettings.targetDomain);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [scrapeResult, setScrapeResult] = useState<SiteScrapeResult | null>(null);

  const handleScrape = async () => {
    if (!domain) return;

    setIsScraping(true);
    setScrapeProgress(0);
    setScrapeResult(null);

    // Visual progress simulation
    const interval = setInterval(() => {
      setScrapeProgress((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 15;
      });
    }, 300);

    // Actual "Analysis" call
    const result = await validateAndScrapeSite(domain);

    clearInterval(interval);
    setScrapeProgress(100);
    
    setTimeout(() => {
      setIsScraping(false);
      setScrapeResult(result);
      // Automatically save the domain if valid
      if (result.success) {
        onSave({ ...currentSettings, targetDomain: domain });
      }
    }, 600);
  };

  const handleSaveManual = () => {
    onSave({ ...currentSettings, targetDomain: domain });
    onBack();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 animate-fade-in absolute inset-0 z-50">
      {/* Header */}
      <div className="flex items-center px-4 py-4 bg-white border-b border-slate-200 sticky top-0 z-10 shadow-sm">
        <button 
          onClick={onBack}
          className="mr-3 p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-600"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
            <path fillRule="evenodd" d="M11.03 3.97a.75.75 0 010 1.06l-6.22 6.22H21a.75.75 0 010 1.5H4.81l6.22 6.22a.75.75 0 11-1.06 1.06l-7.5-7.5a.75.75 0 010-1.06l7.5-7.5a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
        </button>
        <h1 className="text-lg font-bold text-slate-800">Configuración</h1>
      </div>

      <div className="flex-grow overflow-y-auto p-6 space-y-8">
        
        {/* Target URL Section */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-1">
              URL del E-commerce
            </label>
            <p className="text-xs text-slate-500 mb-3">
              Define el sitio específico donde el asistente buscará productos.
            </p>
            
            <div className="flex gap-2">
                <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="ej. nike.com.mx"
                disabled={isScraping}
                className="flex-grow px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm shadow-sm"
                />
            </div>
          </div>

          {/* Scraping Action */}
          <button 
            onClick={handleScrape}
            disabled={!domain || isScraping}
            className={`
                w-full py-3 rounded-xl font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2
                ${!domain || isScraping 
                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                    : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-[0.98]'}
            `}
          >
             {isScraping ? 'Escaneando sitio...' : 'Escanear / Scraping'}
             {!isScraping && (
                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                 <path fillRule="evenodd" d="M10.5 3.75a6.75 6.75 0 100 13.5 6.75 6.75 0 000-13.5zM2.25 10.5a8.25 8.25 0 1114.59 5.28l4.69 4.69a.75.75 0 11-1.06 1.06l-4.69-4.69A8.25 8.25 0 012.25 10.5z" clipRule="evenodd" />
                 </svg>
             )}
          </button>

          {/* Progress Bar */}
          {(isScraping || scrapeProgress > 0) && (
            <div className="space-y-2 animate-fade-in">
                <div className="flex justify-between text-xs font-medium text-slate-600">
                    <span>Progreso de análisis</span>
                    <span>{Math.round(scrapeProgress)}%</span>
                </div>
                <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                    <div 
                        className="h-full bg-indigo-500 transition-all duration-300 ease-out"
                        style={{ width: `${scrapeProgress}%` }}
                    />
                </div>
            </div>
          )}

          {/* Results Card */}
          {scrapeResult && !isScraping && (
            <div className={`p-5 rounded-xl border ${scrapeResult.success ? 'bg-green-50 border-green-100' : 'bg-amber-50 border-amber-100'} animate-fade-in`}>
                <div className="flex items-center gap-3 mb-2">
                    <div className={`p-2 rounded-full ${scrapeResult.success ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            {scrapeResult.success 
                                ? <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                                : <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                            }
                        </svg>
                    </div>
                    <h3 className={`font-bold ${scrapeResult.success ? 'text-green-800' : 'text-amber-800'}`}>
                        {scrapeResult.success ? 'Sitio Verificado' : 'Advertencia'}
                    </h3>
                </div>
                <p className="text-sm text-slate-700 mb-2">
                    {scrapeResult.success 
                        ? `Conectado exitosamente con ${scrapeResult.siteName}.` 
                        : `No pudimos verificar completamente el sitio, pero se guardó la configuración.`}
                </p>
                {scrapeResult.success && (
                    <div className="mt-3 bg-white/60 p-3 rounded-lg flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Inventario Disponible</span>
                        <span className="text-xl font-bold text-slate-900">~{scrapeResult.productCount}</span>
                    </div>
                )}
            </div>
          )}
        </div>

        <hr className="border-slate-100" />

        {/* Danger Zone */}
        <div className="bg-red-50 p-5 rounded-xl border border-red-100">
            <h3 className="text-sm font-bold text-red-800 mb-2">Zona de Peligro</h3>
            <p className="text-xs text-red-600/80 mb-4">
                Esta acción es irreversible y eliminará toda tu conversación actual.
            </p>
            <button 
                onClick={() => {
                if(window.confirm('¿Borrar todo el historial?')) {
                    onClearHistory();
                }
                }}
                className="w-full py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors"
            >
                Borrar historial de chat
            </button>
        </div>

      </div>

      {/* Footer Save Action */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <button 
            onClick={handleSaveManual}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200"
        >
            Guardar y Volver
        </button>
      </div>
    </div>
  );
};

export default ConfigurationView;