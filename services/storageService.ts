import { Message, AppSettings } from '../types';

/**
 * NOTE FOR GITHUB/VERCEL/FIREBASE DEPLOYMENT:
 * 
 * To switch this to real Firebase:
 * 1. Install firebase: `npm install firebase`
 * 2. Initialize Firebase app with your config object.
 * 3. Replace localStorage calls with Firestore `addDoc`, `getDocs`, etc.
 */

const STORAGE_KEY_MESSAGES = 'shopscout_messages';
const STORAGE_KEY_SETTINGS = 'shopscout_settings';
const STORAGE_KEY_CATALOG = 'shopscout_xml_catalog';

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
      targetDomain: '',
      useMockData: false,
      xmlCatalog: null
    };
  } catch (e) {
    return { targetDomain: '', useMockData: false, xmlCatalog: null };
  }
};

export const saveCatalogXML = (xml: string) => {
  try {
    localStorage.setItem(STORAGE_KEY_CATALOG, xml);
    // Also update settings to reflect we have data? 
    // We keep them separate but generally they go together.
  } catch (e) {
    console.error("Error saving XML catalog", e);
  }
};

export const loadCatalogXML = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY_CATALOG);
  } catch (e) {
    return null;
  }
};

export const clearHistory = () => {
  localStorage.removeItem(STORAGE_KEY_MESSAGES);
  // Optional: decide if we want to clear catalog too. Usually better to keep it.
};