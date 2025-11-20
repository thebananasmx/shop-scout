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

// Helper to resolve absolute URLs via simple string concatenation
const resolveUrlRaw = (href: string, baseUrl: string): string => {
    if (!href) return '';
    href = href.trim();
    if (href.startsWith('http://') || href.startsWith('https://')) return href;
    if (href.startsWith('//')) return 'https:' + href;
    
    const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const cleanHref = href.startsWith('/') ? href : '/' + href;
    return cleanBase + cleanHref;
};

export const scrapeSiteClientSide = async (
    domain: string, 
    urlPattern?: string, 
    matchMode: PatternMatchMode = 'CONTAINS'
): Promise<SiteScrapeResult> => {
    // 1. Setup URL
    let baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1); // Normalize base
    
    console.log(`[ClientScraper] Starting Raw Crawl for: ${baseUrl} | Pattern: ${urlPattern || 'NONE'} | Mode: ${matchMode}`);

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

    // 3. RAW PARSING
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const seen = new Set<string>();
    const products: any[] = [];

    // Get ALL Links in the document
    const links = Array.from(doc.querySelectorAll('a'));
    console.log(`[ClientScraper] Found ${links.length} total links. Filtering...`);

    for (const link of links) {
        const rawHref = link.getAttribute('href');
        
        if (!rawHref || rawHref.length < 2 || rawHref.startsWith('#') || rawHref.startsWith('javascript') || rawHref.startsWith('mailto') || rawHref.startsWith('tel')) continue;

        const absUrl = resolveUrlRaw(rawHref, baseUrl);

        // --- FILTER LOGIC UPDATED ---
        let isMatch = true;

        if (urlPattern) {
            if (matchMode === 'CONTAINS') {
                isMatch = absUrl.includes(urlPattern);
            } else if (matchMode === 'ENDS_WITH') {
                isMatch = absUrl.endsWith(urlPattern);
            } else if (matchMode === 'STARTS_WITH') {
                // Check full URL match
                isMatch = absUrl.startsWith(urlPattern);
                // If not matched, check path match (e.g. user typed "/p/" and url is "http://site.com/p/...")
                if (!isMatch) {
                    try {
                        // Simple check: does the url contain the pattern right after the domain?
                        // Or strictly speaking, does the path start with it?
                        // Since this is raw, we can just check if absUrl contains domain + pattern if pattern starts with /
                        const pathStart = absUrl.replace(baseUrl, '');
                        isMatch = pathStart.startsWith(urlPattern);
                    } catch (e) {}
                }
            }
            
            if (!isMatch) continue;
        } 
        else {
            // Heuristic if no pattern
            const lower = absUrl.toLowerCase();
            if (lower === baseUrl || lower === baseUrl + '/' || lower.includes('login') || lower.includes('cart') || lower.includes('account') || lower.includes('contact') || lower.includes('terms')) continue;
        }

        if (seen.has(absUrl)) continue;

        // --- EXTRACTION LOGIC ---
        let img = link.querySelector('img');
        let imgSrc = img?.getAttribute('src') || img?.getAttribute('data-src') || img?.getAttribute('srcset')?.split(' ')[0] || '';
        
        let name = img?.getAttribute('alt') || link.getAttribute('title') || link.innerText || '';
        name = name.replace(/[\r\n\t]+/g, " ").trim();
        
        const linkText = link.innerText;
        const parentText = link.parentElement?.innerText || '';
        const combinedText = (linkText + " " + parentText).replace(/\s+/g, ' ');
        const priceMatch = combinedText.match(/[$€£]\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/) || combinedText.match(/(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)\s?(USD|MXN|MN|EUR)/);
        
        let price = priceMatch ? priceMatch[0] : 'Ver en tienda';

        if (urlPattern) {
            seen.add(absUrl);
            products.push({
                name: name || 'Producto Detectado',
                price: price,
                url: absUrl,
                image: resolveUrlRaw(imgSrc, baseUrl),
                description: ''
            });
        } else {
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

    // 4. JSON-LD Backup
    try {
        const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
        scripts.forEach(script => {
            try {
                const content = script.textContent || '{}';
                const cleanContent = content.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
                const data = JSON.parse(cleanContent);
                
                const process = (node: any) => {
                    if ((node['@type'] === 'Product' || node['@type'] === 'ProductGroup') && node.name) {
                        let u = node.url;
                        if (node.offers) {
                            const o = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                            if (o && o.url) u = o.url;
                        }
                        
                        if (u) {
                            const fullU = resolveUrlRaw(u, baseUrl);
                            
                            // Apply pattern logic to JSON-LD results too
                            let isMatch = true;
                            if (urlPattern) {
                                if (matchMode === 'CONTAINS') isMatch = fullU.includes(urlPattern);
                                else if (matchMode === 'ENDS_WITH') isMatch = fullU.endsWith(urlPattern);
                                else if (matchMode === 'STARTS_WITH') {
                                     isMatch = fullU.startsWith(urlPattern) || fullU.replace(baseUrl, '').startsWith(urlPattern);
                                }
                            }

                            if (isMatch && !seen.has(fullU)) {
                                seen.add(fullU);
                                let i = node.image;
                                if (Array.isArray(i)) i = i[0];
                                if (typeof i === 'object' && i.url) i = i.url;
                                
                                let p = 'Ver en tienda';
                                if (node.offers) {
                                    const o = Array.isArray(node.offers) ? node.offers[0] : node.offers;
                                    if (o.price) p = o.price + (o.priceCurrency ? ' ' + o.priceCurrency : '');
                                }

                                products.unshift({ 
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
            } catch(e) {}
        });
    } catch(e) {}

    console.log(`[ClientScraper] Extracted ${products.length} potential products.`);

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