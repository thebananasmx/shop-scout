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
  const [urlPattern, setUrlPattern] = useState(currentSettings.urlPattern || '');
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeProgress, setScrapeProgress] = useState(0);
  const [scrapeResult, setScrapeResult] = useState<SiteScrapeResult | null>(null);

  // Function to create a temporary URL for the XML string and open it
  const handleViewXml = (xmlContent: string | undefined | null) => {
    if (!xmlContent) return;
    const blob = new Blob([xmlContent], { type: 'text/xml' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  };

  const handleScrape = async () => {
    if (!domain) return;

    setIsScraping(true);
    setScrapeProgress(0);
    setScrapeResult(null);

    // Visual progress simulation
    const interval = setInterval(() => {
      setScrapeProgress((prev) => {
        if (prev >= 85) return prev;
        return prev + 5;
      });
    }, 500);

    // Call the Hybrid Service (Real API -> Fallback AI) with pattern
    const result = await validateAndScrapeSite(domain, urlPattern);

    clearInterval(interval);
    setScrapeProgress(100);
    
    setTimeout(() => {
      setIsScraping(false);
      setScrapeResult(result);
      
      if (result.success) {
        // Save everything
        onSave({ 
            ...currentSettings, 
            targetDomain: domain,
            urlPattern: urlPattern,
            xmlCatalog: result.xml 
        });
      }
    }, 600);
  };

  const handleSaveManual = () => {
    onSave({ 
      ...currentSettings, 
      targetDomain: domain,
      urlPattern: urlPattern 
    });
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
              Define el sitio donde ShopScout creará el catálogo XML.
            </p>
            
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="ej. nike.com.mx"
              disabled={isScraping}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm shadow-sm mb-3"
            />

            <label className="block text-sm font-bold text-slate-800 mb-1">
              Patrón de URL de Producto (Opcional)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Filtra enlaces que contengan este texto (ej. "/p/", "/producto/"). Útil para evitar blogs o categorías.
            </p>
            <input
              type="text"
              value={urlPattern}
              onChange={(e) => setUrlPattern(e.target.value)}
              placeholder="ej. /producto/"
              disabled={isScraping}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm shadow-sm"
            />
          </div>

          {/* Existing Catalog Indicator */}
          {!scrapeResult && currentSettings.xmlCatalog && (
             <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 p-3 rounded-xl mb-2">
                 <div className="flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-indigo-600">
                        <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625z" />
                        <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
                    </svg>
                    <span className="text-sm font-medium text-indigo-900">Catálogo XML Guardado</span>
                 </div>
                 <button 
                    onClick={() => handleViewXml(currentSettings.xmlCatalog)}
                    className="text-xs font-bold text-indigo-600 hover:underline"
                 >
                    Ver XML Raw
                 </button>
             </div>
          )}

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
             {isScraping ? 'Generando XML...' : 'Analizar y Crear XML'}
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
                <p className="text-[10px] text-center text-slate-400 pt-1">
                    {isScraping ? "Extrayendo datos JSON-LD y convirtiendo a XML..." : "Proceso finalizado"}
                </p>
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
                        {scrapeResult.success ? 'XML Generado' : 'Sin productos válidos'}
                    </h3>
                </div>
                <p className="text-sm text-slate-700 mb-2">
                    {scrapeResult.success 
                        ? `Catálogo XML creado para ${scrapeResult.siteName} y almacenado localmente.` 
                        : `No se encontraron productos que coincidan con el criterio.`}
                </p>
                {scrapeResult.success && (
                    <div className="mt-3 bg-white/60 p-3 rounded-lg flex justify-between items-center">
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">Items en XML</span>
                        <div className="flex items-center gap-3">
                            <span className="text-xl font-bold text-slate-900">{scrapeResult.productCount}</span>
                            <button 
                                onClick={() => handleViewXml(scrapeResult.xml)}
                                className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-md font-bold hover:bg-indigo-200 transition-colors"
                            >
                                Ver XML Raw
                            </button>
                        </div>
                    </div>
                )}

                {/* Last Product Preview */}
                {scrapeResult.success && scrapeResult.lastProduct && (
                    <div className="mt-4 p-4 border border-slate-200 rounded-xl bg-white shadow-sm animate-fade-in">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Ejemplo de producto detectado</h4>
                        <div className="flex gap-4">
                            <div className="w-20 h-20 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                                <img 
                                    src={scrapeResult.lastProduct.image} 
                                    alt={scrapeResult.lastProduct.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { (e.target as HTMLImageElement).src = 'https://via.placeholder.com/80'; }}
                                />
                            </div>
                            <div className="flex-grow overflow-hidden">
                                <h5 className="text-sm font-bold text-slate-800 truncate">{scrapeResult.lastProduct.name}</h5>
                                <p className="text-sm text-indigo-600 font-bold mb-2">{scrapeResult.lastProduct.price}</p>
                                <a 
                                    href={scrapeResult.lastProduct.link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded-md hover:bg-slate-700 transition-colors inline-block"
                                >
                                    Probar Link
                                </a>
                            </div>
                        </div>
                    </div>
                )}
            </div>
          )}
        </div>

        <hr className="border-slate-100" />

        {/* Danger Zone */}
        <div className="bg-red-50 p-5 rounded-xl border border-red-100">
            <h3 className="text-sm font-bold text-red-800 mb-2">Zona de Peligro</h3>
            <button 
                onClick={() => {
                if(window.confirm('¿Borrar historial y catálogo XML?')) {
                    onClearHistory();
                }
                }}
                className="w-full py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50 transition-colors"
            >
                Borrar historial y datos
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