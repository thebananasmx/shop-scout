import { SiteScrapeResult } from '../types';

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
    // Strictly return absolute URLs as-is to preserve tracking/variants
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }
    try {
        return new URL(url, base).href;
    } catch (e) {
        return url;
    }
};

export const scrapeSiteClientSide = async (domain: string, urlPattern?: string): Promise<SiteScrapeResult> => {
    if (!domain) return { siteName: '', productCount: 0, success: false };

    const filterPattern = typeof urlPattern === 'string' ? urlPattern : null;
    // Normalize URL
    const targetUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    
    // Use a CORS Proxy to bypass browser restrictions
    // We use corsproxy.io for this demo as it is reliable for simple GET requests
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    try {
        console.log(`Attempting client-side scrape of ${targetUrl} via proxy...`);
        const response = await fetch(proxyUrl);
        
        if (!response.ok) {
            throw new Error(`Client scrape failed: ${response.status}`);
        }

        const html = await response.text();

        // Extract JSON-LD
        const jsonLdMatches = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi);
        
        let products: any[] = [];
        const seenUrls = new Set<string>();

        if (jsonLdMatches) {
            jsonLdMatches.forEach(script => {
                try {
                    const content = script.replace(/<script type="application\/ld\+json">|<\/script>/gi, '');
                    const data = JSON.parse(content);
                    
                    const extract = (node: any) => {
                        const type = Array.isArray(node['@type']) ? node['@type'][0] : node['@type'];
                        
                        if (type === 'Product' || type === 'ProductGroup') {
                            // Smart URL Extraction Logic (Same as Backend)
                            let rawUrl = '';
                            
                            if (node.offers) {
                                const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                if (offer && offer.url) rawUrl = offer.url;
                            }
                            if (!rawUrl && node.url) rawUrl = node.url;
                            if (!rawUrl && typeof node.mainEntityOfPage === 'string') rawUrl = node.mainEntityOfPage;

                            const productUrl = resolveUrl(rawUrl, targetUrl);

                            // Filtering
                            if (!productUrl || productUrl === targetUrl) return;
                            if (filterPattern && !productUrl.includes(filterPattern)) return;
                            if (seenUrls.has(productUrl)) return;
                            seenUrls.add(productUrl);

                            const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                            const price = offer?.price || offer?.highPrice || 'N/A';
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
                    if (data['@graph']) data['@graph'].forEach(extract);
                } catch (e) {
                    // Ignore parse errors
                }
            });
        }

        if (products.length === 0) {
            return {
                success: false,
                siteName: new URL(targetUrl).hostname,
                productCount: 0
            };
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

        const lastItem = products[products.length - 1];
        const lastProduct = lastItem ? {
            name: lastItem.name,
            price: `${lastItem.price} ${lastItem.currency}`,
            image: lastItem.image,
            link: lastItem.url
        } : undefined;

        return {
            success: true,
            siteName: new URL(targetUrl).hostname,
            productCount: products.length,
            xml: xml,
            lastProduct: lastProduct
        };

    } catch (error) {
        console.error("Client scraping error:", error);
        return { siteName: domain, productCount: 0, success: false };
    }
};
