import React, { useState } from 'react';
import { AppSettings } from '../types';

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

  const handleSave = () => {
    onSave({ 
      ...currentSettings, 
      targetDomain: domain,
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

      <div className="flex-grow overflow-y-auto p-6 space-y-8 flex flex-col">
        
        <div className="flex-grow space-y-4">
          <div>
            <label className="block text-sm font-bold text-slate-800 mb-2">
              URL del E-commerce
            </label>
             <p className="text-xs text-slate-500 mb-3">
              Define el único sitio web donde el asistente buscará productos en tiempo real.
            </p>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value.replace(/^(https?:\/\/)?(www\.)?/, '').replace(/\/.*$/, ''))}
              placeholder="ej. nike.com.mx"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white text-sm shadow-sm"
            />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-red-50 p-5 rounded-xl border border-red-100 mt-auto">
            <h3 className="text-sm font-bold text-red-800 mb-2">Zona de Peligro</h3>
            <p className="text-xs text-red-700 mb-3">
              Esto borrará todos los mensajes del chat, pero mantendrá la URL guardada.
            </p>
            <button 
                onClick={() => {
                if(window.confirm('¿Borrar todo el historial del chat?')) {
                    onClearHistory();
                }
                }}
                className="w-full py-2 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-100 transition-colors"
            >
                Borrar historial
            </button>
        </div>

      </div>

      {/* Footer Save Action */}
      <div className="p-4 border-t border-slate-200 bg-white">
        <button 
            onClick={handleSave}
            className="w-full bg-indigo-600 text-white font-bold py-3 rounded-xl hover:bg-indigo-700 active:scale-[0.98] transition-all shadow-lg shadow-indigo-200"
        >
            Guardar y Volver
        </button>
      </div>
    </div>
  );
};

export default ConfigurationView;
