import { NextResponse } from 'next/server';
import { getStats, getLinks } from '@/lib/db';
import { buildFullAnalysis } from '@/lib/ai-engine';
import { chatWithContext, isAIAvailable } from '@/lib/openai';

/**
 * POST /api/ai/chat
 * 
 * Conversational AI endpoint. The local engine pre-computes all analysis,
 * then OpenAI is called only to generate a natural language response.
 * 
 * Body: { message: string, history?: Array<{role, content}> }
 * Returns: { reply: string, aiAvailable: boolean }
 */
export async function POST(request) {
  try {
    const { message, history } = await request.json();

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json(
        { error: 'Message is required' },
        { status: 400 }
      );
    }

    if (!isAIAvailable()) {
      return NextResponse.json(
        { error: 'AI chat is not configured. Add OPENAI_API_KEY to your environment variables to enable it.', aiAvailable: false },
        { status: 503 }
      );
    }

    // Pre-compute local analysis (free) to give the LLM context
    const [stats, links] = await Promise.all([getStats(), getLinks()]);
    const analysis = buildFullAnalysis(stats, links);

    // Call OpenAI with the pre-computed context
    const reply = await chatWithContext(message.trim(), analysis, history || []);

    return NextResponse.json({ reply, aiAvailable: true });
  } catch (error) {
    console.error('AI Chat error:', error);

    // Handle OpenAI-specific errors
    if (error.message?.includes('API key')) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key. Check your OPENAI_API_KEY configuration.', aiAvailable: false },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate response. Please try again.' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/chat
 * Returns whether AI chat is available (API key configured).
 */
export async function GET() {
  return NextResponse.json({ aiAvailable: isAIAvailable() });
}
