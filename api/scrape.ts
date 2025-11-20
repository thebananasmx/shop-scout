import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Force 404 to trigger client-side scraping in the frontend.
    // This is intentional because server-side scraping often gets blocked by IP 
    // in Vercel/Cloud environments, while client-side via Proxy works better.
    return res.status(404).json({ 
        error: "Backend scraping disabled. Use client-side scraping." 
    });
}