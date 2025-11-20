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

export interface Source {
  title: string;
  uri: string;
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: number;
  products?: Product[];
  sources?: Source[];
  isLoading?: boolean;
}

export interface AppSettings {
  useMockData: boolean; // Toggle for testing UI without API calls
}