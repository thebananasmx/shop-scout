import { GoogleGenAI } from "@google/genai";
import { Product, SiteScrapeResult } from "../types";
import { loadCatalogXML, saveCatalogXML } from "./storageService";
import { scrapeSiteClientSide } from "./clientScraper";

const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

export const searchProducts = async (
  query: string, 
  targetDomain: string
): Promise<{ text: string, products: Product[] }> => {

  if (!apiKey) {
    return {
      text: "Error: API Key no configurada. Por favor configura process.env.API_KEY.",
      products: []
    };
  }

  const xmlCatalog = loadCatalogXML();
  const hasXmlContext = xmlCatalog && xmlCatalog.length > 50;

  let searchContext = targetDomain ? `Buscar "${query}" site:${targetDomain}` : query;

  let systemInstruction = `
    Eres ShopScout, un asistente experto en e-commerce.
    ${targetDomain ? `DOMINIO: ${targetDomain}` : ''}
  `;

  if (hasXmlContext) {
    systemInstruction += `
    [CATÁLOGO XML LOCAL DISPONIBLE]
    Usa PRIMERO estos datos escrapeados reales:
    <inventory_snapshot>
    ${xmlCatalog.substring(0, 25000)} 
    </inventory_snapshot>
    
    Si el producto está en el XML, ÚSALO. Copia el link EXACTO del XML.
    `;
  }

  systemInstruction += `
    REGLAS DE ORO:
    1. Si usas datos del XML, el campo "link" debe ser IDÉNTICO al del XML (no lo cortes, no lo limpies).
    2. Devuelve JSON puro.
    
    {
      "summary": "Breve resumen...",
      "products": [{ "name": "...", "price": "...", "imageUrl": "...", "link": "...", "inStock": true }]
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: searchContext,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
      }
    });

    let jsonText = response.text?.replace(/```json/g, "").replace(/```/g, "").trim() || "";
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonText = jsonMatch[0];

    const parsed = JSON.parse(jsonText);
    
    return {
      text: parsed.summary || "Aquí están los resultados encontrados:",
      products: parsed.products || []
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Hubo un error al buscar productos.", products: [] };
  }
};

export const validateAndScrapeSite = async (domain: string, urlPattern?: string): Promise<SiteScrapeResult> => {
  try {
    // --- TRY API FIRST ---
    console.log("Attempting backend scrape...");
    const params = new URLSearchParams({
        url: domain,
        ...(urlPattern ? { pattern: urlPattern } : {})
    });
    
    const response = await fetch(`/api/scrape?${params.toString()}`);
    if (response.ok) {
        const data = await response.json();
        if (data.success && data.xml) {
            saveCatalogXML(data.xml);
            return data;
        }
    }
    throw new Error("Backend unavailable or failed");

  } catch (e) {
      // --- FALLBACK TO ROBUST CLIENT SCRAPER ---
      console.log("Backend failed, switching to Robust Client Scraper...");
      const clientResult = await scrapeSiteClientSide(domain, urlPattern);
      
      if (clientResult.success && clientResult.xml) {
          saveCatalogXML(clientResult.xml);
          return clientResult;
      }

      console.error("Scraping failed on both ends.", e);
      return { siteName: domain, productCount: 0, success: false };
  }
};