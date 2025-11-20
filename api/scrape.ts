import type { VercelRequest, VercelResponse } from '@vercel/node';

// Helper to escape XML characters
const escapeXml = (unsafe: string) => {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  try {
    // 1. Normalize URL
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    
    // 2. Fetch HTML (Real Request)
    const response = await fetch(targetUrl, {
        headers: { 
            'User-Agent': 'ShopScout-Bot/1.0 (Educational AI Assistant)',
            'Accept': 'text/html'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch site: ${response.statusText}`);
    }

    const html = await response.text();

    // 3. Extract JSON-LD (Schema.org Products)
    // We use regex here to avoid heavy dependencies like Cheerio/JSDOM in this lightweight function
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    
    let products: any[] = [];

    if (jsonLdMatches) {
        jsonLdMatches.forEach(script => {
            try {
                const content = script.replace(/<script type="application\/ld\+json">|<\/script>/gi, '');
                const data = JSON.parse(content);
                
                const extract = (node: any) => {
                    const type = Array.isArray(node['@type']) ? node['@type'][0] : node['@type'];
                    
                    if (type === 'Product' || type === 'ProductGroup') {
                        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                        products.push({
                            name: node.name || 'Unknown Product',
                            description: node.description || '',
                            price: offer?.price || 'N/A',
                            currency: offer?.priceCurrency || 'USD',
                            url: node.url || targetUrl,
                            image: Array.isArray(node.image) ? node.image[0] : (node.image || '')
                        });
                    }
                };

                if (Array.isArray(data)) data.forEach(extract);
                else extract(data);
                
                if (data['@graph']) {
                    data['@graph'].forEach(extract);
                }
            } catch (e) {
                // Ignore parse errors for individual blocks
            }
        });
    }

    // 4. Generate XML
    // If no structured data found, we return an empty catalog but success=false to warn the UI
    if (products.length === 0) {
         return res.status(200).json({
            success: false,
            siteName: new URL(targetUrl).hostname,
            productCount: 0,
            message: "No JSON-LD structured data found on this page."
        });
    }

    const xml = `
<catalog>
    <meta>
        <source>${escapeXml(targetUrl)}</source>
        <scraped_at>${new Date().toISOString()}</scraped_at>
    </meta>
    <products>
        ${products.map(p => `
        <product>
            <name>${escapeXml(p.name)}</name>
            <price currency="${escapeXml(p.currency)}">${escapeXml(String(p.price))}</price>
            <description>${escapeXml(p.description.substring(0, 300))}</description>
            <link>${escapeXml(p.url)}</link>
            <image>${escapeXml(p.image)}</image>
        </product>
        `).join('')}
    </products>
</catalog>`.trim();

    return res.status(200).json({
        success: true,
        siteName: new URL(targetUrl).hostname,
        productCount: products.length,
        xml: xml
    });

  } catch (error: any) {
    return res.status(500).json({ error: 'Scraping failed', details: error.message });
  }
}