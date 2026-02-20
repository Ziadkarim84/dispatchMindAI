import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@common/utils/logger.util';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function runPrompt(
  systemPrompt: string,
  userPrompt: string,
  prefill?: string
): Promise<string> {
  logger.debug('Running Claude prompt', { systemLength: systemPrompt.length, userLength: userPrompt.length });

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
  if (prefill) {
    messages.push({ role: 'assistant', content: prefill });
  }

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    system: systemPrompt,
    messages,
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude');

  // Prepend the prefill since Claude continues from it, not repeating it
  return (prefill ?? '') + content.text;
}
