import { GoogleGenAI } from "@google/genai";
import { Product, SiteScrapeResult, PatternMatchMode } from "../types";
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
    Usa EXCLUSIVAMENTE estos datos reales extraídos del sitio:
    <inventory_snapshot>
    ${xmlCatalog.substring(0, 30000)} 
    </inventory_snapshot>
    
    INSTRUCCIÓN CRÍTICA:
    Si encuentras productos en el XML que coincidan con la búsqueda:
    1. Usa el nombre exacto del XML.
    2. Usa el precio exacto del XML.
    3. COPIA EL LINK EXACTO Y LITERAL DEL XML. NO LO MODIFIQUES.
    `;
  }

  systemInstruction += `
    FORMATO DE RESPUESTA (JSON RAW):
    Devuelve SOLAMENTE un objeto JSON válido.
    {
      "summary": "Texto resumen...",
      "products": [
        {
          "name": "Nombre",
          "price": "Precio",
          "description": "Desc",
          "imageUrl": "URL Imagen",
          "link": "URL EXACTA",
          "inStock": true,
          "source": "Origen"
        }
      ]
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
    return { text: "Hubo un error al procesar la búsqueda.", products: [] };
  }
};

export const validateAndScrapeSite = async (
    domain: string, 
    urlPattern?: string,
    matchMode: PatternMatchMode = 'CONTAINS'
): Promise<SiteScrapeResult> => {
  console.log("Initiating Client-Side Raw Scraper...");
  return await scrapeSiteClientSide(domain, urlPattern, matchMode);
};