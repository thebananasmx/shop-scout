import React from 'react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearHistory: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onClearHistory }) => {
  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4 animate-fade-in backdrop-blur-sm">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex justify-between items-center">
          <h2 className="text-lg font-bold text-slate-800">Configuración</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>
        
        <div className="p-6">
          <div className="bg-red-50 p-4 rounded-lg border border-red-100">
            <h3 className="text-sm font-semibold text-red-800 mb-1">Zona de Peligro</h3>
             <p className="text-xs text-red-700 mb-3">
              Esto borrará permanentemente todos los mensajes del chat.
            </p>
            <button 
              onClick={() => {
                if(window.confirm('¿Estás seguro de que quieres borrar todo el historial del chat?')) {
                    onClearHistory();
                    onClose();
                }
              }}
              className="w-full text-center py-2 bg-red-100 text-red-700 text-sm font-bold rounded-lg hover:bg-red-200 transition-colors"
            >
              Borrar historial de chat
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
          <button 
            onClick={onClose}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            Hecho
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;