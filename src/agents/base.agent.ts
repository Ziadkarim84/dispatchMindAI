import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@common/utils/logger.util';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runPrompt(systemPrompt: string, userPrompt: string): Promise<string> {
  logger.debug('Running Claude prompt', { systemLength: systemPrompt.length, userLength: userPrompt.length });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  return content.text;
}
