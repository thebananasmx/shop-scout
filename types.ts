export enum Sender {
  USER = 'USER',
  BOT = 'BOT'
}

export interface Product {
  name: string;
  price: string;
  currency?: string;
  description: string;
  imageUrl: string;
  link: string;
  inStock: boolean;
  source?: string;
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  products?: Product[]; // Optional structured data found by the bot
  isLoading?: boolean;
}

export interface AppSettings {
  targetDomain: string; // e.g., "amazon.com.mx" or "mercadolibre.com.mx"
  useMockData: boolean; // Toggle between real Gemini API and mock for testing UI
  xmlCatalog?: string | null; // Stores the structured XML of the scraped site
}

export interface SiteScrapeResult {
  siteName: string;
  productCount: number; // Estimated or found count
  success: boolean;
  xml?: string; // The generated XML content
}