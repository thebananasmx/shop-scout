import { GoogleGenAI } from "@google/genai";
import { Product, SiteScrapeResult } from "../types";
import { loadCatalogXML, saveCatalogXML } from "./storageService";

// Initialize Gemini Client
// NOTE: In a Vercel environment, ensure process.env.API_KEY is set in Project Settings.
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

  // 1. Check for Local XML Catalog (Scraped Data)
  const xmlCatalog = loadCatalogXML();
  const hasXmlContext = xmlCatalog && xmlCatalog.length > 50;

  // 2. Construct Context
  let searchContext = targetDomain 
    ? `Buscar "${query}" site:${targetDomain}` 
    : query;

  let systemInstruction = `
    Eres ShopScout, un asistente de compras inteligente y minimalista.
    
    OBJETIVO:
    Buscar productos para el usuario.
    ${targetDomain ? `DOMINIO OBJETIVO: ${targetDomain}` : ''}
  `;

  // If we have XML, we inject it and prioritize it over Google Search
  if (hasXmlContext) {
    systemInstruction += `
    
    ================================================
    [FUENTE DE DATOS PRIORITARIA: CATÁLOGO XML LOCAL]
    He analizado previamente el sitio y generado este inventario estructurado. 
    USA ESTA INFORMACIÓN PRIMERO antes de buscar en la web externa.
    
    <inventory_snapshot>
    ${xmlCatalog.substring(0, 20000)} 
    </inventory_snapshot>
    (El XML puede estar truncado, si no encuentras el producto aquí, usa Google Search como respaldo).
    ================================================

    TAREA:
    1. Busca primero en el <inventory_snapshot> productos que coincidan con "${query}".
    2. Si encuentras coincidencias exactas en el XML, úsalas para construir la respuesta JSON.
    3. Si NO encuentras nada en el XML, usa la herramienta 'googleSearch' para buscar en vivo.
    `;
  } else {
    systemInstruction += `
    TAREA:
    1. Realiza la búsqueda utilizando la herramienta 'googleSearch'.
    `;
  }

  systemInstruction += `
    2. Analiza los resultados para encontrar los mejores productos (máximo 4).
    
    REGLA DE ORO PARA LINKS (CRÍTICO):
    - Si tomas un producto del XML, el campo "link" DEBE ser una COPIA EXACTA Y LITERAL del contenido de la etiqueta <link>.
    - NO modifiques, cortes, ni reformatees la URL del XML bajo ninguna circunstancia.
    - Debes preservar todos los parámetros de la URL original (ej. ?v=123).
    - Si la información proviene de Google Search, usa la URL completa del resultado.
    - Si un producto no tiene link válido, DESCÁRTALO.

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
          "link": "URL EXACTA DEL PRODUCTO",
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

    let jsonText = response.text;
    
    if (!jsonText) {
        return { 
            text: "No encontré resultados suficientes.", 
            products: [] 
        };
    }

    // Clean up Markdown
    jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
         try { parsed = JSON.parse(jsonMatch[0]); } catch (err) { parsed = { products: [] }; }
      } else {
         parsed = { products: [] };
      }
    }
    
    return {
      text: parsed.summary || response.text || "Aquí tienes los resultados:",
      products: parsed.products || []
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      text: "Tuve un problema técnico. Por favor intenta de nuevo.",
      products: []
    };
  }
};

export const validateAndScrapeSite = async (domain: string, urlPattern?: string): Promise<SiteScrapeResult> => {
  if (!domain) return { siteName: '', productCount: 0, success: false };

  try {
    // --- OPTION A: REAL SCRAPING API ---
    console.log("Attempting real scrape via /api/scrape...");
    const params = new URLSearchParams({
        url: domain,
        ...(urlPattern ? { pattern: urlPattern } : {})
    });
    
    const response = await fetch(`/api/scrape?${params.toString()}`);
    
    if (response.ok) {
        const data = await response.json();
        if (data.success && data.xml) {
            saveCatalogXML(data.xml);
            return { 
                siteName: data.siteName, 
                productCount: data.productCount, 
                success: true,
                xml: data.xml,
                lastProduct: data.lastProduct
            };
        }
    } 
    console.warn("Real scrape failed or returned no data, falling back to AI simulation.");

  } catch (e) {
      console.warn("API endpoint unreachable. Switching to AI Simulation.");
  }

  // --- OPTION B: AI SIMULATION ---
  // Only if API is unreachable (e.g. pure frontend preview)
  
  if (!apiKey) return { siteName: '', productCount: 0, success: false };

  const searchContext = `site:${domain} products best sellers`;
  const systemInstruction = `
    Actúa como un Web Scraper.
    Analiza los resultados de búsqueda para: ${domain}.
    
    Genera un documento XML válido con TODOS los productos que encuentres en los resultados (Objetivo: 15-30 productos).
    ${urlPattern ? `IMPORTANTE: Solo incluye productos cuya URL contenga "${urlPattern}".` : ''}
    
    IMPORTANTE SOBRE LAS URLs:
    - Extrae la URL real del snippet de búsqueda.
    - NO inventes URLs.
    - NO limpies las URLs (mantén los parámetros).
    
    <catalog>
      <products>
        <product>
          <name>...</name>
          <price>...</price>
          <description>...</description>
          <link>...</link>
          <image>...</image>
        </product>
      </products>
    </catalog>

    Devuelve JSON con el XML: { "siteName": "...", "productCount": 15, "xml": "..." }
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

    let jsonText = response.text?.replace(/```json/g, "").replace(/```/g, "").trim();
    if (!jsonText) throw new Error("No response");
    const parsed = JSON.parse(jsonText);
    if (parsed.xml) saveCatalogXML(parsed.xml);

    return {
        siteName: parsed.siteName || domain,
        productCount: parsed.productCount || 5,
        success: true,
        xml: parsed.xml
    };
  } catch (error) {
    console.error("Simulation Error:", error);
    return { siteName: domain, productCount: 0, success: false };
  }
};