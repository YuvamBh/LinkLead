/**
 * LinkLead — OpenAI Integration (Thin Layer)
 * 
 * Only used for conversational chat and optional narrative summaries.
 * All heavy analytics are pre-computed by lib/ai-engine.js before this is called.
 * 
 * Cost controls:
 * - gpt-4o-mini (15x cheaper than gpt-4o)
 * - Response cache with TTL
 * - Pre-computed analysis context (no raw data sent)
 * - Graceful degradation when no API key is present
 */

import OpenAI from 'openai';

// ─── Cache ──────────────────────────────────────────────────────────────────

const responseCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCacheKey(type, input) {
  // Simple hash of stringified input
  const str = JSON.stringify({ type, input });
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `${type}_${hash}`;
}

function getFromCache(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Limit cache size to prevent memory growth in long-running servers
  if (responseCache.size > 100) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  responseCache.set(key, { data, timestamp: Date.now() });
}

// ─── Client Setup ───────────────────────────────────────────────────────────

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  return new OpenAI({ apiKey });
}

export function isAIAvailable() {
  return !!process.env.OPENAI_API_KEY;
}

// ─── System Prompt ──────────────────────────────────────────────────────────

function buildSystemPrompt(analysisData) {
  return `You are the AI assistant built into LinkLead, a link tracking and lead-generation analytics tool. You help users understand their click data and generate leads.

CONTEXT — Here is the current analysis data (pre-computed by our local analytics engine):

${JSON.stringify(analysisData, null, 2)}

GUIDELINES:
- Be concise and actionable. Users want quick, specific insights they can act on.
- Use data from the analysis above to support every claim. Don't make up numbers.
- When suggesting strategies, be specific to their actual data patterns (devices, countries, referrers).
- Format responses with markdown for readability (bold, lists, etc).
- If asked to write content (LinkedIn posts, tweets, emails), make it engaging and relevant to their audience profile.
- If data is insufficient, say so honestly rather than guessing.
- Keep responses under 300 words unless the user asks for detail.
- You are a lead generation expert — always tie insights back to actionable growth advice.`;
}

// ─── Chat with Context ──────────────────────────────────────────────────────

/**
 * Sends a user message to GPT-4o-mini with pre-computed analysis as context.
 * Returns the response string.
 */
export async function chatWithContext(message, analysisData, chatHistory = []) {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI API key not configured');
  }

  const messages = [
    { role: 'system', content: buildSystemPrompt(analysisData) },
    ...chatHistory.slice(-6), // Keep last 6 messages for context, limit token usage
    { role: 'user', content: message },
  ];

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 600,
    temperature: 0.7,
  });

  return completion.choices[0]?.message?.content || 'I couldn\'t generate a response. Please try again.';
}

// ─── Narrative Summary ──────────────────────────────────────────────────────

/**
 * Generates a human-readable narrative summary from structured analysis data.
 * Results are cached for 1 hour to avoid redundant API calls.
 */
export async function generateNarrativeSummary(analysisData) {
  const cacheKey = getCacheKey('narrative', {
    score: analysisData.opportunityScore?.score,
    trend: analysisData.trend?.direction,
    tipCount: analysisData.tips?.length,
  });

  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const client = getOpenAIClient();
  if (!client) return null;

  const completion = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'You are a concise analytics copywriter. Write a 2-3 sentence executive summary of the link performance data. Be specific with numbers. No fluff.',
      },
      {
        role: 'user',
        content: `Summarize this link analytics data:\n${JSON.stringify(analysisData, null, 2)}`,
      },
    ],
    max_tokens: 200,
    temperature: 0.5,
  });

  const result = completion.choices[0]?.message?.content || null;
  if (result) setCache(cacheKey, result);
  return result;
}
