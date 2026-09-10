import { NextResponse } from 'next/server';
import { getStats, getLinks } from '@/lib/db';
import { buildFullAnalysis } from '@/lib/ai-engine';
import { chatWithContext, isAIAvailable } from '@/lib/openai';

/**
 * POST /api/ai/chat
 *
 * Context-aware conversational AI endpoint.
 * The caller passes a `context` object describing what the user is looking at:
 *   { page: 'dashboard' | 'link' | 'category', slug?, category? }
 *
 * The local engine pre-computes scoped analysis at zero API cost.
 * OpenAI is called only to generate the natural language response.
 *
 * Body: { message: string, context?: object, history?: Array<{role, content}> }
 * Returns: { reply: string, aiAvailable: boolean }
 */
export async function POST(request) {
  try {
    const { message, context, history } = await request.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    if (!isAIAvailable()) {
      return NextResponse.json(
        { error: 'AI chat is not configured. Add OPENAI_API_KEY to your environment to enable it.', aiAvailable: false },
        { status: 503 }
      );
    }

    // Determine query scope from context
    const slugFilter = context?.slug || null;
    const categoryFilter = context?.category || null;

    // Pre-compute local analysis (free) scoped to the user's current view
    const [stats, allLinks] = await Promise.all([
      getStats(slugFilter, categoryFilter),
      getLinks(),
    ]);

    // Scope links to the current view for the analysis engine
    const scopedLinks = slugFilter
      ? allLinks.filter(l => l.slug === slugFilter)
      : categoryFilter
        ? allLinks.filter(l => (l.category || 'Other') === categoryFilter)
        : allLinks;

    const analysis = buildFullAnalysis(stats, scopedLinks);

    // Build context summary for the system prompt
    const contextSummary = buildContextSummary(context, scopedLinks);

    const reply = await chatWithContext(message.trim(), analysis, history || [], contextSummary);
    return NextResponse.json({ reply, aiAvailable: true });

  } catch (error) {
    console.error('AI Chat error:', error);
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key. Check your OPENAI_API_KEY configuration.', aiAvailable: false },
        { status: 401 }
      );
    }
    return NextResponse.json({ error: 'Failed to generate response. Please try again.' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ aiAvailable: isAIAvailable() });
}

// ─── Context Summary Builder ─────────────────────────────────────────────────

function buildContextSummary(context, links) {
  if (!context) return 'The user is viewing the main dashboard with all links.';

  const { page, slug, category } = context;

  if (page === 'link' && slug) {
    const link = links.find(l => l.slug === slug);
    const dest = link?.destination || 'unknown destination';
    const cat = link?.category || 'uncategorized';
    const label = link?.label ? ` (${link.label})` : '';
    return `The user is viewing the individual analytics page for the link "/${slug}"${label}, which points to ${dest}. Category: ${cat}. Answer questions specifically about this link only.`;
  }

  if (page === 'category' && category) {
    const count = links.length;
    return `The user is viewing the "${category}" category dashboard, which contains ${count} link${count === 1 ? '' : 's'}. All analysis data shown is scoped to this category only. Answer questions specifically about this category.`;
  }

  return `The user is viewing the main dashboard with all ${links.length} links across all categories.`;
}
