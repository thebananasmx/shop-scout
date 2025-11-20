import { GoogleGenAI } from "@google/genai";
import { Product } from "../types";

const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

/**
 * Clasifica una consulta de usuario como genérica o específica.
 * @param query La consulta del usuario.
 * @returns true si la consulta es genérica, false si es específica o en caso de error.
 */
const isQueryGeneric = async (query: string): Promise<boolean> => {
  try {
    const prompt = `Analiza la siguiente consulta de búsqueda de un usuario para un e-commerce: "${query}".
    La consulta es:
    A) Específica (contiene marca, modelo, tipo de producto claro, etc. - ej. "tenis Nike Air Max 270 para hombre", "laptop Dell XPS 15 con 16GB RAM").
    B) Genérica (es demasiado amplia y se beneficiaría de más detalles - ej. "zapatos", "chamarras", "un regalo").

    Responde SOLAMENTE con la letra "A" o "B".`;

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
    });
    const resultText = response.text?.trim().toUpperCase();
    return resultText === 'B';
  } catch (error) {
    console.error("Error en la clasificación de la consulta:", error);
    // Falla de forma segura: asume que la consulta es específica si la clasificación falla
    return false;
  }
};

/**
 * Genera una pregunta para pedir al usuario más detalles sobre su búsqueda genérica.
 * @param query La consulta genérica original del usuario.
 * @returns Una pregunta de clarificación.
 */
const generateClarifyingQuestion = async (query: string): Promise<string> => {
    try {
        const prompt = `Eres un asistente de compras servicial. El usuario ha hecho una búsqueda muy genérica: "${query}".
Tu objetivo es ayudarle a acotar su búsqueda.
Genera una pregunta amigable y útil que le pida más detalles para poder encontrar el producto perfecto.
Ejemplos:
- Si el usuario busca "chamarras", podrías preguntar: "¡Claro! Para darte mejores opciones, ¿buscas chamarra para hombre o mujer? ¿Para el frío, la lluvia o algo más casual?"
- Si el usuario busca "regalo", podrías preguntar: "¡Excelente idea! ¿Para quién es el regalo y cuál es tu presupuesto aproximado?"
- Si el usuario busca "celular", podrías preguntar: "Por supuesto. ¿Tienes alguna marca en mente o alguna característica importante como la cámara o la batería?"

Responde SOLAMENTE con la pregunta que harías al usuario.`;
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        
        return response.text?.trim() || `Tu búsqueda de "${query}" es un poco amplia. ¿Puedes darme más detalles?`;
    } catch (error) {
        console.error("Error generando la pregunta aclaratoria:", error);
        return `Tu búsqueda de "${query}" es un poco amplia. ¿Podrías darme más detalles sobre lo que necesitas?`;
    }
};


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

  // Lógica de pre-clasificación de la consulta
  const isGeneric = await isQueryGeneric(query);
  if (isGeneric) {
      const question = await generateClarifyingQuestion(query);
      return { text: question, products: [] };
  }

  const searchContext = `Buscar "${query}" site:${targetDomain}`;

  const systemInstruction = `
    Eres ShopScout, un asistente experto en e-commerce que busca productos en tiempo real con MÁXIMA PRECISIÓN.
    Tu tarea es buscar productos directamente en el sitio web especificado por el usuario usando tus herramientas de búsqueda.
    DOMINIO OBJETIVO: ${targetDomain}

    REGLAS DE MÁXIMA PRECISIÓN:
    1.  **BÚSQUEDA EXCLUSIVA:** Limita TODA tu búsqueda al dominio: site:${targetDomain}. No busques en ningún otro sitio.
    2.  **EXTRACCIÓN VERIFICADA:** Analiza las páginas de resultados para encontrar información REAL y VERIFICADA.
        *   **Precio Real:** Extrae el precio exacto visible en la página del producto. Si no hay precio, déjalo como "No disponible".
        *   **Imagen Real:** La 'imageUrl' DEBE ser la URL directa de la imagen principal del producto. No uses imágenes de baja calidad de los resultados de búsqueda. Asegúrate de que la URL sea pública y accesible.
        *   **Enlace Directo (PDP):** El 'link' DEBE ser la URL directa a la página de detalles del producto (PDP), no a una categoría o lista de búsqueda.
    3.  **NO INVENTAR:** Si no puedes verificar un dato (ej. precio, imagen), es mejor omitirlo o indicarlo como no disponible. No inventes información.
    4.  **RELEVANCIA:** Prioriza siempre los productos que mejor coincidan con la búsqueda del usuario. Si no encuentras el producto exacto, menciona productos similares que sí encontraste.

    REGLAS DE INTERACCIÓN:
    1.  **LIMITAR RESULTADOS:** Limita la lista de \`products\` a un MÁXIMO de 5 resultados, incluso si encuentras más.
    2.  **OFRECER MÁS:** Si encontraste más de 5 productos, menciónalo en tu \`summary\` e invita al usuario a pedir más. Por ejemplo: 'Encontré varios modelos. Aquí están los 5 más relevantes. ¿Quieres que te muestre los siguientes?'.
    3.  **CLARIDAD:** Si el sitio no tiene el producto, indícalo claramente.

    FORMATO DE RESPUESTA (JSON RAW):
    Devuelve SOLAMENTE un objeto JSON válido.
    {
      "summary": "Texto resumen de tu hallazgo, sé amigable y conversacional.",
      "products": [
        {
          "name": "Nombre EXACTO del Producto Encontrado",
          "price": "Precio con moneda (ej. '$1,299.00 MXN') o 'No disponible'",
          "description": "Breve descripción oficial del producto",
          "imageUrl": "URL de la imagen principal del producto (verificada)",
          "link": "URL EXACTA y directa a la página del producto (verificada)",
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
      }
    });

    // The response should be JSON because of the prompt, but we'll be safe
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