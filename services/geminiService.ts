import { GoogleGenAI } from "@google/genai";
import { Product, SiteScrapeResult } from "../types";

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

  // Enforce domain specific search if configured by appending 'site:' operator
  // This ensures results are strictly from the user's preferred e-commerce site
  const searchContext = targetDomain 
    ? `Buscar "${query}" site:${targetDomain}` 
    : query;

  const systemInstruction = `
    Eres ShopScout, un asistente de compras inteligente y minimalista.
    
    OBJETIVO:
    Buscar productos específicos en internet utilizando Google Search y devolver la información en formato JSON estructurado.
    ${targetDomain ? `IMPORTANTE: El usuario ha configurado buscar EXCLUSIVAMENTE en: ${targetDomain}. Filtra cualquier resultado que no sea de este dominio.` : ''}

    TAREA:
    1. Realiza la búsqueda utilizando la herramienta 'googleSearch' con el contexto proporcionado.
    2. Analiza los resultados para encontrar los mejores productos (máximo 4) que coincidan con: "${query}".
    3. Para cada producto, extrae la siguiente información de los resultados de búsqueda:
       - Nombre: Título claro del producto.
       - Precio: El precio final/actual visible (incluye el símbolo de moneda).
       - Descripción: Breve resumen de características.
       - Imagen: URL de la imagen del producto. Intenta encontrar la imagen principal en los metadatos del resultado.
       - Link: El enlace directo a la página del producto.
       - Stock: Infiere si está disponible (true/false).

    FORMATO DE RESPUESTA (JSON RAW):
    Devuelve SOLAMENTE un objeto JSON válido. NO incluyas bloques de código Markdown (como \`\`\`json) ni texto adicional antes o después del JSON.
    
    Estructura requerida:
    {
      "summary": "Resumen corto y amigable (ej. 'Encontré estas opciones de [Producto] en [Sitio]...')",
      "products": [
        {
          "name": "Nombre del producto",
          "price": "$0.00",
          "description": "Descripción corta",
          "imageUrl": "https://ejemplo.com/foto.jpg",
          "link": "https://ejemplo.com/producto",
          "inStock": true,
          "source": "${targetDomain || 'Tienda'}"
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
            text: "No encontré resultados suficientes. Intenta ser más específico con tu búsqueda.", 
            products: [] 
        };
    }

    // Clean up Markdown code blocks if present
    jsonText = jsonText.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonText);
    } catch (e) {
      console.warn("JSON parsing failed. Raw text:", jsonText);
      const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
            parsed = JSON.parse(jsonMatch[0]);
        } catch (retryError) {
            return { text: response.text || "Encontré información pero no pude formatearla correctamente.", products: [] };
        }
      } else {
        return { text: response.text || "Aquí tienes la información solicitada.", products: [] };
      }
    }
    
    return {
      text: parsed.summary || "He encontrado los siguientes productos:",
      products: parsed.products || []
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    return {
      text: "Lo siento, tuve un problema técnico al realizar la búsqueda. Por favor intenta de nuevo en unos segundos.",
      products: []
    };
  }
};

export const validateAndScrapeSite = async (domain: string): Promise<SiteScrapeResult> => {
  if (!domain || !apiKey) return { siteName: '', productCount: 0, success: false };

  // We simulate a "scrape" by searching for the site itself and some product keywords
  const searchContext = `site:${domain} products`;

  const systemInstruction = `
    Analiza los resultados de búsqueda para el dominio: ${domain}.
    
    TAREA:
    1. Identifica el nombre oficial de la tienda.
    2. Estima una cantidad de productos "indexados" o "encontrados" basándote en los resultados (genera un número realista entre 50 y 5000 si parece ser una tienda válida).
    
    Devuelve SOLO JSON:
    {
      "siteName": "Nombre de la Tienda",
      "productCount": 150,
      "isValidStore": true
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

    let jsonText = response.text?.replace(/```json/g, "").replace(/```/g, "").trim();
    if (!jsonText) throw new Error("No response");
    
    const parsed = JSON.parse(jsonText);
    
    return {
        siteName: parsed.siteName || domain,
        productCount: parsed.productCount || 0,
        success: parsed.isValidStore || false
    };

  } catch (error) {
    console.error("Scrape Error:", error);
    return { siteName: domain, productCount: 0, success: false };
  }
};