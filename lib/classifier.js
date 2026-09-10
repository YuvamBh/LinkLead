/**
 * LinkLead — Dynamic Link Classifier
 *
 * Infers category and tags from a destination URL using domain + path heuristics.
 * Categories are not fixed — new ones are created on the fly as new link patterns emerge.
 * Returns a { category, confidence, tags } object that gets stored on the link.
 */

// ─── Known Domain Rules ──────────────────────────────────────────────────────

const DOMAIN_RULES = [
  // Survey / Form tools
  { pattern: /typeform\.com/i,      category: 'Survey',    tags: ['typeform'],       confidence: 'high' },
  { pattern: /forms\.gle|docs\.google\.com\/forms/i, category: 'Survey', tags: ['google-forms'], confidence: 'high' },
  { pattern: /surveymonkey\.com/i,  category: 'Survey',    tags: ['surveymonkey'],   confidence: 'high' },
  { pattern: /tally\.so/i,          category: 'Survey',    tags: ['tally'],          confidence: 'high' },
  { pattern: /jotform\.com/i,       category: 'Survey',    tags: ['jotform'],        confidence: 'high' },
  { pattern: /airtable\.com\/shr/i, category: 'Survey',    tags: ['airtable-form'],  confidence: 'high' },
  { pattern: /paperform\.co/i,      category: 'Survey',    tags: ['paperform'],      confidence: 'high' },
  { pattern: /cognito?forms\.com/i, category: 'Survey',    tags: ['cognitoforms'],   confidence: 'high' },

  // Documentation / Wiki
  { pattern: /notion\.so|notion\.site/i, category: 'Docs', tags: ['notion'],         confidence: 'high' },
  { pattern: /gitbook\.io|gitbook\.com/i,category: 'Docs', tags: ['gitbook'],        confidence: 'high' },
  { pattern: /readthedocs\.io/i,         category: 'Docs', tags: ['readthedocs'],    confidence: 'high' },
  { pattern: /confluence\.com/i,         category: 'Docs', tags: ['confluence'],     confidence: 'high' },
  { pattern: /wikijs|mediawiki/i,        category: 'Docs', tags: ['wiki'],           confidence: 'medium' },

  // Portfolio / Creative
  { pattern: /github\.com|github\.io/i,  category: 'Portfolio', tags: ['github'],   confidence: 'high' },
  { pattern: /behance\.net/i,            category: 'Portfolio', tags: ['behance'],  confidence: 'high' },
  { pattern: /dribbble\.com/i,           category: 'Portfolio', tags: ['dribbble'], confidence: 'high' },
  { pattern: /figma\.com\/community/i,   category: 'Portfolio', tags: ['figma'],    confidence: 'high' },
  { pattern: /read\.cv|read\.cv/i,       category: 'Portfolio', tags: ['read-cv'],  confidence: 'high' },

  // Social Media
  { pattern: /twitter\.com|x\.com/i,     category: 'Social', tags: ['twitter'],     confidence: 'high' },
  { pattern: /linkedin\.com/i,           category: 'Social', tags: ['linkedin'],    confidence: 'high' },
  { pattern: /instagram\.com/i,          category: 'Social', tags: ['instagram'],   confidence: 'high' },
  { pattern: /youtube\.com|youtu\.be/i,  category: 'Social', tags: ['youtube'],     confidence: 'high' },
  { pattern: /tiktok\.com/i,             category: 'Social', tags: ['tiktok'],      confidence: 'high' },
  { pattern: /reddit\.com/i,             category: 'Social', tags: ['reddit'],      confidence: 'high' },
  { pattern: /t\.me|telegram\.me/i,      category: 'Social', tags: ['telegram'],    confidence: 'high' },

  // E-commerce / Product Purchase
  { pattern: /shopify\.com|myshopify\.com/i, category: 'Shop',    tags: ['shopify'],  confidence: 'high' },
  { pattern: /gumroad\.com/i,                category: 'Shop',    tags: ['gumroad'],  confidence: 'high' },
  { pattern: /lemonsqueezy\.com/i,           category: 'Shop',    tags: ['lemon-squeezy'], confidence: 'high' },
  { pattern: /stripe\.com\/pay/i,            category: 'Shop',    tags: ['stripe'],   confidence: 'high' },
  { pattern: /buy\.stripe\.com/i,            category: 'Shop',    tags: ['stripe'],   confidence: 'high' },
  { pattern: /amazon\.com|amzn\.to/i,        category: 'Shop',    tags: ['amazon'],   confidence: 'high' },
  { pattern: /etsy\.com/i,                   category: 'Shop',    tags: ['etsy'],     confidence: 'high' },

  // Video / Webinar
  { pattern: /zoom\.us|zoom\.com/i,          category: 'Meeting',  tags: ['zoom'],   confidence: 'high' },
  { pattern: /calendly\.com/i,               category: 'Meeting',  tags: ['calendly'], confidence: 'high' },
  { pattern: /cal\.com/i,                    category: 'Meeting',  tags: ['cal-com'], confidence: 'high' },
  { pattern: /meet\.google\.com/i,           category: 'Meeting',  tags: ['google-meet'], confidence: 'high' },
  { pattern: /loom\.com/i,                   category: 'Video',    tags: ['loom'],   confidence: 'high' },
  { pattern: /vimeo\.com/i,                  category: 'Video',    tags: ['vimeo'],  confidence: 'high' },

  // Job / Career
  { pattern: /lever\.co|greenhouse\.io|ashbyhq\.com|workable\.com/i, category: 'Jobs', tags: ['job-board'], confidence: 'high' },
  { pattern: /linkedin\.com\/jobs/i,                                  category: 'Jobs', tags: ['linkedin-jobs'], confidence: 'high' },

  // App stores
  { pattern: /apps\.apple\.com/i,  category: 'App',  tags: ['app-store'],   confidence: 'high' },
  { pattern: /play\.google\.com/i, category: 'App',  tags: ['play-store'],  confidence: 'high' },

  // News / Blog
  { pattern: /medium\.com/i,       category: 'Article', tags: ['medium'],   confidence: 'high' },
  { pattern: /substack\.com/i,     category: 'Article', tags: ['substack'], confidence: 'high' },
  { pattern: /hashnode\.dev/i,     category: 'Article', tags: ['hashnode'], confidence: 'high' },
  { pattern: /dev\.to/i,           category: 'Article', tags: ['devto'],    confidence: 'high' },
];

// ─── Path / Keyword Rules (applied when no domain rule matches) ──────────────

const PATH_RULES = [
  { pattern: /\/(pricing|plans?|subscribe|checkout|buy|order|shop|store)/i, category: 'Product',  confidence: 'medium' },
  { pattern: /\/(signup|sign-up|register|join|get-started|start)/i,         category: 'Product',  confidence: 'medium' },
  { pattern: /\/(demo|trial|free-trial)/i,                                   category: 'Product',  confidence: 'medium' },
  { pattern: /\/(docs|documentation|api|reference|guide|manual|wiki)/i,     category: 'Docs',     confidence: 'medium' },
  { pattern: /\/(blog|post|article|news|press)/i,                            category: 'Article',  confidence: 'medium' },
  { pattern: /\/(portfolio|work|projects?|case-studies?|showcase)/i,         category: 'Portfolio',confidence: 'medium' },
  { pattern: /\/(about|team|careers?|jobs?|hiring)/i,                        category: 'Jobs',     confidence: 'medium' },
  { pattern: /\/(survey|form|feedback|poll|quiz)/i,                          category: 'Survey',   confidence: 'medium' },
  { pattern: /\/(event|webinar|conference|meetup|workshop)/i,                category: 'Event',    confidence: 'medium' },
];

// ─── Classifier ──────────────────────────────────────────────────────────────

/**
 * Classifies a destination URL and returns a category + tags.
 * Always returns something — falls back to a domain-derived category name.
 *
 * @param {string} destination - The full destination URL
 * @returns {{ category: string, confidence: 'high'|'medium'|'inferred', tags: string[] }}
 */
export function classifyLink(destination) {
  if (!destination) return { category: 'Other', confidence: 'inferred', tags: [] };

  let url;
  try {
    url = new URL(destination.startsWith('http') ? destination : `https://${destination}`);
  } catch {
    return { category: 'Other', confidence: 'inferred', tags: [] };
  }

  const fullUrl = url.href;
  const hostname = url.hostname.replace(/^www\./, '');
  const pathname = url.pathname;

  // 1. Check domain rules first (highest confidence)
  for (const rule of DOMAIN_RULES) {
    if (rule.pattern.test(fullUrl)) {
      return { category: rule.category, confidence: rule.confidence, tags: rule.tags || [] };
    }
  }

  // 2. Check path rules (medium confidence)
  for (const rule of PATH_RULES) {
    if (rule.pattern.test(pathname)) {
      return { category: rule.category, confidence: rule.confidence, tags: [] };
    }
  }

  // 3. Infer from hostname — create a new category from the root domain name
  // e.g. "myapp.io" → "Myapp", "acme-corp.com" → "Acme-corp"
  const domainParts = hostname.split('.');
  const rootDomain = domainParts.length >= 2 ? domainParts[domainParts.length - 2] : domainParts[0];
  const inferredCategory = rootDomain.charAt(0).toUpperCase() + rootDomain.slice(1);

  return {
    category: inferredCategory,
    confidence: 'inferred',
    tags: [rootDomain.toLowerCase()],
  };
}

/**
 * Returns a human-readable label suggestion for a link based on its URL.
 * Used to pre-fill the "Label" field in the creation modal.
 *
 * @param {string} destination
 * @returns {string}
 */
export function suggestLabel(destination) {
  if (!destination) return '';

  let url;
  try {
    url = new URL(destination.startsWith('http') ? destination : `https://${destination}`);
  } catch {
    return '';
  }

  const hostname = url.hostname.replace(/^www\./, '');
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Use last non-numeric path part as label if meaningful
  const meaningfulPart = [...pathParts].reverse().find(p => !/^\d+$/.test(p) && p.length > 2);
  if (meaningfulPart) {
    return meaningfulPart
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase())
      .slice(0, 48);
  }

  return hostname.split('.')[0].replace(/\b\w/g, c => c.toUpperCase());
}
