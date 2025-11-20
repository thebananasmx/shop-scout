import { GoogleGenAI } from "@google/genai";
import { Product, Message, Sender, Source } from "../types";

const apiKey = process.env.API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

// Represents the output of Phase 1
interface SearchPlan {
  isProductSearch: boolean;
  needsClarification: boolean;
  responseText: string;
  productUrls: string[];
  sources: Source[];
}

// Represents the final structured response for the UI
interface FinalResponse {
  text: string;
  products: Product[];
  sources: Source[];
}

/**
 * PHASE 1: Analyze conversation and create a search plan.
 * Determines if it's a product search, a general question, or needs clarification.
 * If it's a product search, it returns URLs.
 */
export const getSearchPlan = async (messages: Message[]): Promise<SearchPlan> => {
  if (!apiKey) throw new Error("API Key not configured.");

  const conversationHistory = messages.map(msg =>
    `${msg.sender === Sender.USER ? 'Usuario' : 'Asistente'}: ${msg.text}`
  ).join('\n');

  const systemInstruction = `
    You are an AI search assistant router. Your job is to analyze the user's latest message in the context of a conversation and decide the next step.
    You MUST respond ONLY with a raw JSON object. Do not add any text before or after the JSON. Do not use markdown like \`\`\`json.

    Your JSON output structure MUST BE:
    {"summary": "...", "urls": ["url1", "url2", ...]}

    CRITICAL RULES:
    1.  **If the user is asking for products, recommendations, or comparisons**:
        - Use the Google Search tool to find 3-5 product page URLs.
        - A product page URL must look like '.../product/item-name' or '.../p/12345'.
        - **YOU MUST AVOID**: Homepages ('store.com'), category pages ('.../collections/shoes'), brand pages ('.../brands/nike'), and search result pages.
        - The "summary" should be a brief confirmation message like "Encontré algunas páginas relevantes. Analizándolas ahora...".
        - The "urls" array MUST contain the high-quality product URLs you found.

    2.  **If the user's request is too vague to search for products** (e.g., "I need shoes", "laptops"):
        - The "summary" MUST be a clarifying question. Example: "¡Claro! ¿Qué tipo de zapatos buscas? ¿Algo casual, deportivo o formal?".
        - The "urls" array MUST be empty.

    3.  **If the user asks a general knowledge question** (e.g., "what is the capital of France"):
        - The "summary" MUST be the direct answer to the question.
        - The "urls" array MUST be empty.

    EXAMPLE of a GOOD product search response:
    {"summary": "¡Claro! Encontré algunos tenis Adidas. Analizando los detalles...", "urls": ["https://www.adidas.mx/tenis-ultraboost/123", "https://www.innovasport.com/p/adidas-galaxy-6/456"]}
  `;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `CONVERSATION HISTORY:\n${conversationHistory}\n\nLATEST USER MESSAGE: "${messages[messages.length - 1].text}"`,
    config: { systemInstruction, tools: [{ googleSearch: {} }] },
  });

  const responseText = response.text?.trim() || "";
  const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
  const sources: Source[] = groundingChunks
      .map((chunk: any) => ({
        uri: chunk.web?.uri || '',
        title: chunk.web?.title || '',
      }))
      .filter((source: Source) => source.uri && source.title);

  try {
    // Attempt to parse the response as JSON, cleaning potential markdown first
    const cleanResponse = responseText.replace(/^```json\s*/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleanResponse);

    if (parsed.summary && parsed.urls && Array.isArray(parsed.urls)) {
        // We got the structured response we wanted.
        const isVague = parsed.urls.length === 0 && parsed.summary.includes('?');
        
        return {
            isProductSearch: parsed.urls.length > 0,
            needsClarification: isVague,
            responseText: parsed.summary,
            productUrls: parsed.urls,
            sources: sources,
        };
    }
  } catch (e) {
    // Parsing failed. This means the model gave a plain text response for a general question.
    // This is our fallback.
  }

  // Fallback: The response was not the expected JSON. Treat it as a direct answer.
  return {
    isProductSearch: false,
    needsClarification: false,
    responseText: responseText || "No pude procesar esa respuesta.",
    productUrls: [],
    sources,
  };
};

/**
 * PHASE 2: Scrape product data from a list of URLs using our backend endpoint.
 */
export const scrapeProductData = async (urls: string[]): Promise<Product[]> => {
  const scrapePromises = urls.map(url =>
    fetch('/api/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    })
    .then(res => {
        if (!res.ok) {
            console.error(`Failed to scrape ${url}: ${res.statusText}`);
            return null; // Return null on failure
        }
        return res.json();
    })
    .catch(err => {
        console.error(`Error in scrape fetch for ${url}:`, err);
        return null; // Return null on error
    })
  );

  const results = await Promise.all(scrapePromises);
  return results.filter((p): p is Product => p !== null && p.name && p.price && p.imageUrl);
};