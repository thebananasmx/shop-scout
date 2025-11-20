import { SiteScrapeResult } from '../types';

// Helper to escape XML characters strictly for XML validity
const escapeXml = (unsafe: string) => {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
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

// Helper to resolve absolute URLs via simple string concatenation
// Avoids URL() object strictness which can break some partial URLs
const resolveUrlRaw = (href: string, baseUrl: string): string => {
    if (!href) return '';
    href = href.trim();
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    if (href.startsWith('//')) return 'https:' + href;
    
    // Remove trailing slash from base if present
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    // Ensure href starts with /
    const cleanHref = href.startsWith('/') ? href : '/' + href;
    
    return cleanBase + cleanHref;
};

export const scrapeSiteClientSide = async (domain: string, urlPattern?: string): Promise<SiteScrapeResult> => {
    // 1. Setup URL
    let baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1); // Normalize base
    
    console.log(`[ClientScraper] Starting Raw Crawl for: ${baseUrl} with pattern: ${urlPattern || 'NONE'}`);

    // 2. Proxies (Try multiple to ensure we get HTML)
    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(baseUrl)}`
    ];

    let html = '';
    for (const proxy of proxies) {
        try {
            console.log(`[ClientScraper] Fetching via: ${proxy}`);
            const res = await fetch(proxy);
            if (res.ok) {
                html = await res.text();
                // Verify we got something substantial
                if (html.length > 1000) break;
            }
        } catch (e) { 
            console.warn('Proxy failed', e); 
        }
    }

    if (!html) {
        console.error("[ClientScraper] Failed to fetch HTML from any proxy.");
        return { success: false, siteName: domain, productCount: 0 };
    }

    // 3. RAW PARSING (Maximum Permissiveness)
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const seen = new Set<string>();
    const products: any[] = [];

    // Get ALL Links in the document
    const links = Array.from(doc.querySelectorAll('a'));
    console.log(`[ClientScraper] Found ${links.length} total links. Filtering...`);

    for (const link of links) {
        const rawHref = link.getAttribute('href');
        
        // Basic sanity check to skip anchors/scripts
        if (!rawHref || rawHref.length < 2 || rawHref.startsWith('#') || rawHref.startsWith('javascript') || rawHref.startsWith('mailto')) continue;

        const absUrl = resolveUrlRaw(rawHref, baseUrl);

        // --- FILTER LOGIC ---
        
        // A. URL PATTERN (High Priority)
        // If user provided "/p/", we take EVERYTHING that has "/p/"
        if (urlPattern) {
            if (!absUrl.includes(urlPattern)) continue;
        } 
        // B. NO PATTERN (Visual Heuristic)
        // If no pattern, we need to be smart to avoid grabbing "Home", "Contact", etc.
        else {
            const lower = absUrl.toLowerCase();
            // Skip common non-product pages
            if (lower === baseUrl || lower === baseUrl + '/' || lower.includes('login') || lower.includes('cart') || lower.includes('account') || lower.includes('contact')) continue;
        }

        if (seen.has(absUrl)) continue;

        // --- EXTRACTION LOGIC ---
        
        // 1. Image
        // Look for image inside the link
        let img = link.querySelector('img');
        let imgSrc = img?.getAttribute('src') || img?.getAttribute('data-src') || img?.getAttribute('srcset')?.split(' ')[0] || '';
        
        // 2. Name
        // Alt text -> Title attribute -> Inner Text
        let name = img?.getAttribute('alt') || link.getAttribute('title') || link.innerText || '';
        name = name.replace(/[\r\n\t]+/g, " ").trim();
        
        // 3. Price
        // Look for currency symbol in the link's text or parent's text
        const linkText = link.innerText;
        const parentText = link.parentElement?.innerText || '';
        const combinedText = (linkText + " " + parentText).replace(/\s+/g, ' ');
        const priceMatch = combinedText.match(/[$€£]\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/) || combinedText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(USD|MXN|MN|EUR)/);
        
        let price = priceMatch ? priceMatch[0] : 'Ver en tienda';

        // --- DECISION TO KEEP ---
        
        if (urlPattern) {
            // If it matches the pattern, we keep it even if image/name are weak.
            // We try to fill missing data with placeholders.
            seen.add(absUrl);
            products.push({
                name: name || 'Producto (Sin nombre detectado)',
                price: price,
                url: absUrl,
                image: resolveUrlRaw(imgSrc, baseUrl),
                description: ''
            });
        } else {
            // If no pattern, we enforce Image + Name > 3 chars to ensure quality
            if (imgSrc && name.length > 3) {
                seen.add(absUrl);
                products.push({
                    name: name,
                    price: price,
                    url: absUrl,
                    image: resolveUrlRaw(imgSrc, baseUrl),
                    description: ''
                });
            }
        }
    }

    // 4. JSON-LD Backup (Merge results)
    // We still check JSON-LD because it's the highest quality data if available.
    try {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        scripts.forEach(script => {
            const content = script.textContent || '{}';
            const data = JSON.parse(content);
            const process = (node: any) => {
                if ((node['@type'] === 'Product' || node['@type'] === 'ProductGroup') && node.name) {
                    // Try to get URL
                    let u = node.url || (node.offers && node.offers[0]?.url);
                    if (u) {
                        const fullU = resolveUrlRaw(u, baseUrl);
                        if (urlPattern && !fullU.includes(urlPattern)) return; // Respect pattern
                        
                        if (!seen.has(fullU)) {
                            seen.add(fullU);
                            // Try to get Image
                            let i = node.image;
                            if (Array.isArray(i)) i = i[0];
                            if (typeof i === 'object') i = i.url;
                            
                            // Try to get Price
                            let p = 'Ver en tienda';
                            if (node.offers) {
                                const o = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                if (o.price) p = o.price + (o.priceCurrency ? ' ' + o.priceCurrency : '');
                            }

                            products.unshift({ // Add to top as it's high quality
                                name: node.name,
                                price: p,
                                url: fullU,
                                image: resolveUrlRaw(i || '', baseUrl),
                                description: node.description || ''
                            });
                        }
                    }
                }
            };
            if (Array.isArray(data)) data.forEach(process);
            else process(data);
            if (data['@graph']) data['@graph'].forEach(process);
        });
    } catch(e) {}

    console.log(`[ClientScraper] Extracted ${products.length} potential products.`);

    if (products.length === 0) {
        return { success: false, siteName: domain, productCount: 0 };
    }

    // Limit XML size
    const limited = products.slice(0, 80);

    const xml = `
<catalog>
<meta><source>${escapeXml(baseUrl)}</source></meta>
<products>
${limited.map(p => `
<product>
<name>${escapeXml(p.name)}</name>
<price>${escapeXml(p.price)}</price>
<link>${escapeXml(p.url)}</link>
<image>${escapeXml(p.image)}</image>
</product>`).join('')}
</products>
</catalog>`.trim();

    return {
        success: true,
        siteName: new URL(baseUrl).hostname,
        productCount: limited.length,
        xml: xml,
        lastProduct: limited[limited.length - 1] ? {
            name: limited[limited.length - 1].name,
            price: limited[limited.length - 1].price,
            image: limited[limited.length - 1].image,
            link: limited[limited.length - 1].url
        } : undefined
    };
};