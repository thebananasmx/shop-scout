import { GoogleGenAI } from "@google/genai";
import { Product, Message, Sender } from "../types";

const apiKey = process.env.API_KEY || ''; 
const ai = new GoogleGenAI({ apiKey });

/**
 * Procesa una conversación, decide si buscar productos o pedir clarificación, y devuelve el resultado.
 * @param messages El historial de mensajes de la conversación.
 * @param targetDomain El dominio del e-commerce donde buscar.
 * @returns Un objeto con el texto de respuesta y una lista de productos (si aplica).
 */
export const searchProducts = async (
  messages: Message[], 
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

  // Formatear el historial para la IA
  const conversationHistory = messages.map(msg => 
    `${msg.sender === Sender.USER ? 'Usuario' : 'Asistente'}: ${msg.text}`
  ).join('\n');

  const systemInstruction = `
    Eres ShopScout, un asistente experto en e-commerce que busca productos en tiempo real con MÁXIMA PRECISIÓN y mantiene una conversación natural.
    Tu tarea es analizar el HISTORIAL DE CONVERSACIÓN para entender la intención completa del usuario.
    DOMINIO OBJETIVO para buscar: ${targetDomain}

    PROCESO DE DECISIÓN:
    1.  **ANALIZA EL HISTORIAL:** Lee todo el historial para sintetizar lo que el usuario realmente quiere. Ej: Si el usuario dice "chamarras" y luego "para hombre", tu búsqueda interna debe ser "chamarras para hombre".
    2.  **DECIDE LA ACCIÓN:**
        *   **SI LA INTENCIÓN ES CLARA (contiene producto, tipo, marca, etc.):** Realiza la búsqueda de productos. Tu respuesta DEBE ser el formato JSON.
        *   **SI LA INTENCIÓN ES VAGA (ej. "zapatos", "un regalo", o una respuesta a una pregunta tuya que aún es muy general):** NO busques. En su lugar, haz una pregunta de clarificación para obtener más detalles. Tu respuesta DEBE ser TEXTO PLANO con la pregunta.

    REGLAS DE BÚSQUEDA (solo si la acción es buscar):
    1.  **BÚSQUEDA EXCLUSIVA:** Limita TODA tu búsqueda al dominio: site:${targetDomain}.
    2.  **EXTRACCIÓN VERIFICADA:** El 'link' DEBE ser la URL directa a la página del producto (PDP). La 'imageUrl' DEBE ser la URL de la imagen principal del producto. El 'price' DEBE ser el precio real y visible en esa página.
    3.  **NO INVENTAR:** Si no puedes verificar un dato, indícalo como "No disponible".
    4.  **LÍMITE:** Devuelve un MÁXIMO de 5 productos. Si encuentras más, menciónalo en el 'summary'.

    FORMATO DE RESPUESTA:
    *   **CASO BÚSQUEDA EXITOSA (JSON RAW):**
        {
          "summary": "Texto resumen de tu hallazgo.",
          "products": [{"name": "...", "price": "...", "description": "...", "imageUrl": "...", "link": "...", "inStock": true, "source": "${targetDomain}"}]
        }
    *   **CASO PREGUNTA DE CLARIFICACIÓN (TEXTO PLANO):**
        Ej: ¡Claro! Para darte mejores opciones, ¿buscas chamarra para hombre o mujer? ¿Para el frío, la lluvia o algo más casual?
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `HISTORIAL DE CONVERSACIÓN:\n${conversationHistory}`,
      config: {
        systemInstruction: systemInstruction,
        tools: [{ googleSearch: {} }],
      }
    });

    const responseText = response.text?.trim() || "";

    // Intenta analizar la respuesta como JSON. Si falla, es una pregunta de clarificación.
    try {
      // Intenta encontrar un bloque JSON, incluso si hay texto antes o después.
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // No hay JSON, es una respuesta conversacional.
        return { text: responseText, products: [] };
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        text: parsed.summary || "Aquí están los resultados que encontré:",
        products: parsed.products || []
      };
    } catch (e) {
      // El análisis falló, lo que significa que la respuesta de la IA fue una pregunta o un texto simple.
      return { text: responseText, products: [] };
    }

  } catch (error) {
    console.error("Gemini API Error:", error);
    return { text: "Hubo un error al comunicarme con el asistente. Por favor, intenta de nuevo.", products: [] };
  }
};