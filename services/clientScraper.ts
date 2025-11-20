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

// Helper to resolve absolute URLs
const resolveUrl = (url: string, base: string) => {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;
    try {
        return new URL(url, base).href;
    } catch (e) {
        return url;
    }
};

export const scrapeSiteClientSide = async (domain: string, urlPattern?: string): Promise<SiteScrapeResult> => {
    if (!domain) return { siteName: '', productCount: 0, success: false };

    const targetUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    // Use corsproxy.io to bypass CORS and IP blocks often seen by Vercel
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;

    try {
        console.log(`[ClientScraper] Fetching ${targetUrl} via proxy...`);
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
        
        const html = await response.text();
        
        // Use Browser's Native DOM Parser - Much more powerful than Regex
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        let products: any[] = [];
        const seenUrls = new Set<string>();
        const filterPattern = urlPattern || null;

        // STRATEGY 1: JSON-LD (Structured Data - Best Quality)
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        scripts.forEach(script => {
            try {
                const data = JSON.parse(script.textContent || '{}');
                
                const processNode = (node: any) => {
                    const type = Array.isArray(node['@type']) ? node['@type'][0] : node['@type'];
                    if (type === 'Product' || type === 'ProductGroup') {
                        
                        // URL logic
                        let rawUrl = node.url;
                        if (node.offers) {
                            const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                            if (offer && offer.url) rawUrl = offer.url;
                        }
                        if (!rawUrl) return; // Strict: No URL, no product

                        const absUrl = resolveUrl(rawUrl, targetUrl);
                        
                        if (filterPattern && !absUrl.includes(filterPattern)) return;
                        if (seenUrls.has(absUrl)) return;
                        
                        const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                        const price = offer?.price || offer?.highPrice || 'N/A';
                        const image = resolveUrl(Array.isArray(node.image) ? node.image[0] : (node.image || ''), targetUrl);

                        seenUrls.add(absUrl);
                        products.push({
                            name: node.name,
                            price: price,
                            currency: offer?.priceCurrency || '',
                            description: node.description || '',
                            url: absUrl,
                            image: image,
                            source: 'json-ld'
                        });
                    }
                };

                if (Array.isArray(data)) data.forEach(processNode);
                else processNode(data);
                if (data['@graph']) data['@graph'].forEach(processNode);

            } catch (e) { /* ignore json error */ }
        });

        // STRATEGY 2: OpenGraph (If Single Product Page)
        if (products.length === 0) {
            const ogType = doc.querySelector('meta[property="og:type"]')?.getAttribute('content');
            if (ogType === 'product') {
                const title = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
                const image = doc.querySelector('meta[property="og:image"]')?.getAttribute('content');
                const url = doc.querySelector('meta[property="og:url"]')?.getAttribute('content') || targetUrl;
                const price = doc.querySelector('meta[property="product:price:amount"]')?.getAttribute('content');
                const currency = doc.querySelector('meta[property="product:price:currency"]')?.getAttribute('content');

                if (title && price) {
                    products.push({
                        name: title,
                        price: price,
                        currency: currency || '',
                        description: '',
                        url: resolveUrl(url, targetUrl),
                        image: resolveUrl(image || '', targetUrl),
                        source: 'opengraph'
                    });
                }
            }
        }

        // STRATEGY 3: DOM Heuristic (Visual Scraper for Listing Pages)
        // Looks for <a> tags that contain an <img> and resemble a product card
        if (products.length === 0) {
            console.log("[ClientScraper] Fallback to DOM Heuristic scan...");
            const links = doc.querySelectorAll('a');
            
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (!href || href === '#' || href.startsWith('javascript:')) return;

                const absUrl = resolveUrl(href, targetUrl);

                // Apply User Pattern Filter Strict
                if (filterPattern && !absUrl.includes(filterPattern)) return;
                
                // Deduplicate
                if (seenUrls.has(absUrl)) return;

                // Must contain an image to be considered a product card
                const img = link.querySelector('img');
                if (!img) return;

                // Look for price-like text inside the link or immediately after
                // We search for numbers with typical currency symbols
                const linkText = link.innerText;
                const parentText = link.parentElement?.innerText || '';
                const combinedText = (linkText + " " + parentText).replace(/\s+/g, ' ');
                
                // Regex for price like $1,200.00 or 1200 MN
                const priceMatch = combinedText.match(/[\$€£]\s?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(\d+)\s?MN/);
                
                if (priceMatch) {
                    // It looks like a product!
                    const name = img.getAttribute('alt') || link.getAttribute('title') || linkText.trim() || 'Producto';
                    const imgSrc = img.getAttribute('src') || img.getAttribute('data-src') || '';
                    
                    if (name.length > 2 && imgSrc && !imgSrc.includes('data:image')) {
                        seenUrls.add(absUrl);
                        products.push({
                            name: name,
                            price: priceMatch[0], // Take the whole match including symbol
                            currency: '',
                            description: '',
                            url: absUrl,
                            image: resolveUrl(imgSrc, targetUrl),
                            source: 'dom-heuristic'
                        });
                    }
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

        // Limit to 50 items to keep XML light
        const limitedProducts = products.slice(0, 50);

        const xml = `
<catalog>
    <meta>
        <source>${escapeXml(targetUrl)}</source>
        <scraped_at>${new Date().toISOString()}</scraped_at>
        <method>client-hybrid</method>
    </meta>
    <products>
        ${limitedProducts.map(p => `
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

        const lastItem = limitedProducts[limitedProducts.length - 1];
        return {
            success: true,
            siteName: new URL(targetUrl).hostname,
            productCount: limitedProducts.length,
            xml: xml,
            lastProduct: lastItem ? {
                name: lastItem.name,
                price: `${lastItem.price} ${lastItem.currency}`,
                image: lastItem.image,
                link: lastItem.url
            } : undefined
        };

    } catch (error) {
        console.error("[ClientScraper] Error:", error);
        return { siteName: domain, productCount: 0, success: false };
    }
};