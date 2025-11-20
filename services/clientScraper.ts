import { SiteScrapeResult, PatternMatchMode } from '../types';

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

// Helper to resolve absolute URLs, more robustly using URL constructor
const resolveUrlRaw = (href: string, baseUrl: string): string => {
    if (!href) return '';
    href = href.trim();
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    if (href.startsWith('//')) return 'https:' + href;
    
    try {
        return new URL(href, baseUrl).href;
    } catch (e) {
        // Fallback for malformed hrefs
        const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        const cleanHref = href.startsWith('/') ? href : '/' + href;
        return cleanBase + cleanHref;
    }
};

export const scrapeSiteClientSide = async (
    domain: string, 
    urlPattern?: string, 
    matchMode: PatternMatchMode = 'CONTAINS'
): Promise<SiteScrapeResult> => {
    let baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    
    console.log(`[ClientScraper] Starting HUMAN-LIKE crawl for: ${baseUrl}`);

    const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(baseUrl)}`,
        `https://corsproxy.io/?${encodeURIComponent(baseUrl)}`
    ];

    let html = '';
    for (const proxy of proxies) {
        try {
            const res = await fetch(proxy, { headers: { 'Accept': 'text/html' } });
            if (res.ok) {
                html = await res.text();
                if (html.length > 1000) break;
            }
        } catch (e) { console.warn('Proxy failed', e); }
    }

    if (!html) {
        return { success: false, siteName: domain, productCount: 0 };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const seenUrls = new Set<string>();
    const products: any[] = [];
    const priceRegex = /(?:\$|€|£|USD|MXN)\s*[\d,]+(?:\.\d{2})?/i;

    // A "human-like" scraper finds elements that LOOK like products.
    // A product usually has a link, an image, a name, and a price in close proximity.
    // We'll start by finding all links that contain an image, as this is a strong signal.
    const candidateLinks = Array.from(doc.querySelectorAll('a')).filter(a => a.querySelector('img'));
    console.log(`[ClientScraper] Found ${candidateLinks.length} potential product links (containing images). Analyzing...`);

    for (const link of candidateLinks) {
        const href = link.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) continue;

        const fullUrl = resolveUrlRaw(href, baseUrl);
        if (seenUrls.has(fullUrl)) continue;

        // Find the best "container" for this product's data.
        // We go up the DOM tree from the link, looking for the smallest parent
        // element that also contains a price. This is our product "card".
        let container: HTMLElement | null = link;
        let foundPriceInContainer = false;
        for (let i = 0; i < 5 && container; i++) {
            if (container.textContent && priceRegex.test(container.textContent)) {
                foundPriceInContainer = true;
                break;
            }
            container = container.parentElement;
        }

        if (!container || !foundPriceInContainer) {
            continue; // No price found near the link, discard.
        }
        
        // --- With a container confirmed, extract details ---

        // 1. Extract Price
        const priceText = container.textContent || '';
        const priceMatch = priceText.match(priceRegex);
        const price = priceMatch ? priceMatch[0].trim() : 'N/A';

        // 2. Extract Image
        const img = container.querySelector('img');
        const imageUrl = img ? resolveUrlRaw(img.dataset.src || img.src || '', baseUrl) : '';
        if (!imageUrl) continue; // No valid image

        // 3. Extract Name (with priority)
        let name = '';
        if (img && img.alt) name = img.alt;
        
        if (!name) {
            const h = container.querySelector('h2, h3, h4, .product-title, .product-name');
            if (h) name = h.textContent || '';
        }
        
        if (!name) name = link.textContent || '';
        
        name = name.replace(/\s+/g, ' ').trim();
        if (!name) continue; // No valid name

        // 4. Final user-defined URL pattern filter
        let patternMatches = true;
        if (urlPattern) {
            const pathOnly = new URL(fullUrl).pathname;
            if (matchMode === 'CONTAINS') patternMatches = pathOnly.includes(urlPattern);
            else if (matchMode === 'ENDS_WITH') patternMatches = pathOnly.endsWith(urlPattern);
            else if (matchMode === 'STARTS_WITH') patternMatches = pathOnly.startsWith(urlPattern.startsWith('/') ? urlPattern : '/' + urlPattern);
        }

        if (patternMatches) {
            seenUrls.add(fullUrl);
            products.push({
                name: name,
                price: price,
                url: fullUrl,
                image: imageUrl
            });
        }
    }
    
    console.log(`[ClientScraper] Found ${products.length} products via human-like analysis.`);

    if (products.length === 0) {
        return { success: false, siteName: domain, productCount: 0 };
    }

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

    const lastItem = limited[limited.length - 1];

    return {
        success: true,
        siteName: new URL(baseUrl).hostname,
        productCount: limited.length,
        xml: xml,
        lastProduct: lastItem ? {
            name: lastItem.name,
            price: lastItem.price,
            image: lastItem.image,
            link: lastItem.url
        } : undefined
    };
};
