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

// Helper to resolve relative URLs to absolute
const resolveUrl = (url: string, base: string) => {
    if (!url) return '';
    try {
        return new URL(url, base).href;
    } catch (e) {
        // If it fails, return original (might already be absolute or data uri)
        return url;
    }
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
                        
                        // Resolve URLs
                        const productUrl = resolveUrl(node.url, targetUrl);
                        const imageUrl = resolveUrl(Array.isArray(node.image) ? node.image[0] : (node.image || ''), targetUrl);

                        products.push({
                            name: node.name || 'Unknown Product',
                            description: node.description || '',
                            price: offer?.price || 'N/A',
                            currency: offer?.priceCurrency || 'USD',
                            url: productUrl || targetUrl,
                            image: imageUrl
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

    // Prepare preview of the last product found
    const lastItem = products[products.length - 1];
    const lastProduct = lastItem ? {
        name: lastItem.name,
        price: `${lastItem.price} ${lastItem.currency}`,
        image: lastItem.image,
        link: lastItem.url
    } : undefined;

    return res.status(200).json({
        success: true,
        siteName: new URL(targetUrl).hostname,
        productCount: products.length,
        xml: xml,
        lastProduct: lastProduct
    });

  } catch (error: any) {
    return res.status(500).json({ error: 'Scraping failed', details: error.message });
  }
}