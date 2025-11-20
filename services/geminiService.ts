import { GoogleGenAI } from "@google/genai";
import { Product } from "../types";

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
  
  if (!targetDomain) {
    return {
      text: "Por favor, primero configura un sitio web de e-commerce en el menú de configuración para que pueda buscar.",
      products: []
    }
  }

  const searchContext = `Buscar "${query}" site:${targetDomain}`;

  const systemInstruction = `
    Eres ShopScout, un asistente experto en e-commerce que busca productos en tiempo real.
    Tu tarea es buscar productos directamente en el sitio web especificado por el usuario usando tus herramientas de búsqueda.
    DOMINIO OBJETIVO: ${targetDomain}

    INSTRUCCIÓN CRÍTICA:
    1. Limita TODA tu búsqueda al dominio: site:${targetDomain}.
    2. Analiza los resultados para encontrar el nombre, precio, descripción, URL de la imagen y el link DIRECTO al producto.
    3. Si no encuentras el producto exacto, menciona productos similares que sí encontraste en ese sitio.
    4. Si el sitio no tiene el producto, indícalo claramente. No inventes productos.
    5. Prioriza la información más relevante y actualizada que encuentres.

    FORMATO DE RESPUESTA (JSON RAW):
    Devuelve SOLAMENTE un objeto JSON válido.
    {
      "summary": "Texto resumen de tu hallazgo, sé amigable y conversacional.",
      "products": [
        {
          "name": "Nombre del Producto Encontrado",
          "price": "Precio con moneda si es posible",
          "description": "Breve descripción del producto",
          "imageUrl": "URL de la imagen del producto",
          "link": "URL EXACTA y directa a la página del producto",
          "inStock": true,
          "source": "${targetDomain}"
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
        responseMimeType: "application/json",
      }
    });

    // The response should be JSON because of responseMimeType, but we'll be safe
    let jsonText = response.text?.replace(/```json/g, "").replace(/```/g, "").trim() || "";
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonText = jsonMatch[0];

    const parsed = JSON.parse(jsonText);
    
    return {
      text: parsed.summary || "Aquí están los resultados que encontré en vivo para ti:",
      products: parsed.products || []
    };

  } catch (error) {
    console.error("Gemini API Error:", error);
    const errorMessage = "Hubo un error al buscar en el sitio. Puede que el sitio esté bloqueando el acceso o que no se haya encontrado una respuesta válida. Intenta con otra búsqueda.";
    if (error instanceof Error && error.message.includes('json')) {
         return { text: `${errorMessage} (El formato de respuesta no fue JSON válido.)`, products: [] };
    }
    return { text: errorMessage, products: [] };
  }
};
