import { Message, AppSettings } from '../types';

const STORAGE_KEY_MESSAGES = 'scout_messages';
const STORAGE_KEY_SETTINGS = 'scout_settings';

export const saveMessages = (messages: Message[]) => {
  try {
    localStorage.setItem(STORAGE_KEY_MESSAGES, JSON.stringify(messages));
  } catch (e) {
    console.error("Error saving messages locally", e);
  }
};

export const loadMessages = (): Message[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_MESSAGES);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

export const saveSettings = (settings: AppSettings) => {
  try {
    localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
  } catch (e) {
    console.error("Error saving settings", e);
  }
};

export const loadSettings = (): AppSettings => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SETTINGS);
    return stored ? JSON.parse(stored) : {
      useMockData: false,
    };
  } catch (e) {
    return { 
      useMockData: false, 
    };
  }
};

export const clearHistory = () => {
  localStorage.removeItem(STORAGE_KEY_MESSAGES);
};