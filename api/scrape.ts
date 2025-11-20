import { GoogleGenAI } from "@google/genai";
import { VercelRequest, VercelResponse } from '@vercel/node';
import { Product } from '../types';

// This function can be deployed as a Vercel serverless function.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { url } = req.body;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL is required' });
  }

  const apiKey = process.env.API_KEY || '';
  if (!apiKey) {
    return res.status(500).json({ error: "API key not configured on server" });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Fetch the HTML content of the page from the server to avoid CORS issues
    const pageResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch page: ${pageResponse.statusText}`);
    }
    const htmlContent = await pageResponse.text();

    // Clean up HTML to reduce token usage
    const bodyContent = htmlContent.match(/<body[^>]*>[\s\S]*<\/body>/i);
    const cleanHtml = (bodyContent ? bodyContent[0] : htmlContent)
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .substring(0, 100000); // Limit tokens


    const systemInstruction = `
      You are an expert web scraping bot. Your task is to extract product information from the provided HTML text content.
      You MUST respond ONLY with a raw JSON object. Do not include markdown formatting like \`\`\`json.
      The JSON object should match this structure:
      {
        "name": "Product Name",
        "price": "Price with currency symbol",
        "description": "A brief, compelling description of the product.",
        "imageUrl": "The absolute URL to the main product image (must start with http or https).",
        "inStock": boolean,
        "link": "The original URL provided"
      }
      If a value is not found, use a reasonable default (e.g., empty string for text, false for inStock, "#" for imageUrl).
      Find the most prominent, highest-resolution image for 'imageUrl'.
    `;
    
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Extract product details from this HTML content for the URL ${url}:\n\n${cleanHtml}`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      }
    });

    const text = response.text?.trim();
    if (!text) {
        throw new Error("Empty response from AI for scraping.");
    }
    
    const productData = JSON.parse(text) as Product;
    productData.link = url; // Ensure the original link is present
    productData.source = new URL(url).hostname; // Add source domain

    return res.status(200).json(productData);

  } catch (error) {
    console.error(`Error scraping ${url}:`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return res.status(500).json({ error: `Failed to scrape product data from ${url}. Reason: ${errorMessage}` });
  }
}
