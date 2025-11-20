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
// UPDATED: Returns raw string if already absolute to prevent "cleaning"
const resolveUrl = (url: string, base: string) => {
    if (!url) return '';
    // If it's already absolute, return it EXACTLY as is. 
    // Do not use new URL() which might normalize paths or encoding.
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    try {
        return new URL(url, base).href;
    } catch (e) {
        return url;
    }
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { url, pattern } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'URL parameter is required' });
  }

  const filterPattern = typeof pattern === 'string' ? pattern : null;

  try {
    // 1. Normalize Target URL
    const targetUrl = url.startsWith('http') ? url : `https://${url}`;
    
    // 2. Fetch HTML (Real Request pretending to be Chrome)
    const response = await fetch(targetUrl, {
        headers: { 
            // Spoof Real Browser to avoid blocking and get full JSON-LD
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache'
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to fetch site: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();

    // 3. Extract JSON-LD (Schema.org Products)
    const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
    
    let products: any[] = [];
    const seenUrls = new Set<string>(); // To prevent duplicates

    if (jsonLdMatches) {
        jsonLdMatches.forEach(script => {
            try {
                const content = script.replace(/<script type="application\/ld\+json">|<\/script>/gi, '');
                const data = JSON.parse(content);
                
                const extract = (node: any) => {
                    const type = Array.isArray(node['@type']) ? node['@type'][0] : node['@type'];
                    
                    if (type === 'Product' || type === 'ProductGroup') {
                        // Smart URL Extraction: Priority to specific offer/variant URL
                        let rawUrl = '';
                        
                        // 1. Check offers first (often contains the specific variant URL)
                        if (node.offers) {
                            const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                            if (offer && offer.url) {
                                rawUrl = offer.url;
                            }
                        }

                        // 2. Fallback to main node URL
                        if (!rawUrl && node.url) {
                            rawUrl = node.url;
                        }

                        // 3. Fallback to mainEntityOfPage
                        if (!rawUrl && typeof node.mainEntityOfPage === 'string') {
                            rawUrl = node.mainEntityOfPage;
                        }

                        // Resolve to absolute URL (Preserving RAW if absolute)
                        const productUrl = resolveUrl(rawUrl, targetUrl);

                        // --- STRICT FILTERING & VALIDATION ---
                        
                        // 1. Must be a valid string and distinct from base
                        if (!productUrl || productUrl === targetUrl) return;

                        // 2. Pattern matching (if configured)
                        if (filterPattern && !productUrl.includes(filterPattern)) return;

                        // 3. Deduplication
                        if (seenUrls.has(productUrl)) return;
                        seenUrls.add(productUrl);

                        // Price extraction
                        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                        const price = offer?.price || offer?.highPrice || 'N/A'; // Handle ranges if needed

                        // Image extraction
                        const imageUrl = resolveUrl(Array.isArray(node.image) ? node.image[0] : (node.image || ''), targetUrl);

                        products.push({
                            name: node.name || 'Unknown Product',
                            description: node.description || '',
                            price: price,
                            currency: offer?.priceCurrency || 'USD',
                            url: productUrl,
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
                // Ignore parse errors
            }
        });
    }

    // 4. Generate XML
    if (products.length === 0) {
         return res.status(200).json({
            success: false,
            siteName: new URL(targetUrl).hostname,
            productCount: 0,
            message: "No structured product data matched criteria."
        });
    }

    // We use escapeXml to ensure the XML is valid, but we trust the URL we extracted.
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