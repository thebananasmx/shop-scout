import React, { useState, useEffect } from 'react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClearHistory: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, currentSettings, onSave, onClearHistory }) => {
  const [domain, setDomain] = useState(currentSettings.targetDomain);
  
  useEffect(() => {
    if (isOpen) {
        setDomain(currentSettings.targetDomain);
    }
  }, [isOpen, currentSettings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave({
      ...currentSettings,
      targetDomain: domain
    });
    onClose();
  };

  return (
    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">Configuración</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Sitio Web Preferido (Opcional)
            </label>
            <p className="text-xs text-slate-500 mb-2">
              Limita la búsqueda a un dominio específico.
            </p>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="ej. amazon.com.mx"
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
          </div>

          <hr className="border-slate-100" />

          <div className="bg-red-50 p-4 rounded-lg border border-red-100">
            <h3 className="text-sm font-semibold text-red-800 mb-1">Zona de Peligro</h3>
            <button 
              onClick={() => {
                if(window.confirm('¿Borrar todo el historial?')) {
                    onClearHistory();
                    onClose();
                }
              }}
              className="text-red-600 text-xs font-medium hover:underline flex items-center"
            >
              Borrar historial de chat
            </button>
          </div>

        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={handleSave}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;