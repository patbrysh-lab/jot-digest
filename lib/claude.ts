import Anthropic from '@anthropic-ai/sdk'
import type { InboxItem, DigestOutput } from '@/types'

const SYSTEM_PROMPT = `You are a productivity assistant that processes raw idea dumps and notes into structured action items and project clusters.

Rules:
- Never invent commitments or deadlines. Only extract explicit ones mentioned in the text.
- Keep tone concise and practical.
- Consolidate related ideas into single actions.
- Confidence score (0-1) reflects how clear/actionable the item is.
- Only include items as actions if they are genuinely actionable tasks.
- Ideas, observations, and reflections should stay as notes.
- Output ONLY valid JSON. No markdown, no explanation.`

const USER_PROMPT = (items: InboxItem[]) => `Process these inbox items into a digest. Each item has an id and raw_text.

Items:
${items.map(i => `[${i.id}] (${new Date(i.created_at).toLocaleDateString()}): ${i.raw_text}`).join('\n')}

Return JSON in exactly this schema:
{
  "proposed_actions": [
    {
      "title": "Short, clear action title",
      "details": "More context if needed (can be empty string)",
      "confidence": 0.85,
      "derived_from": ["item-uuid-1", "item-uuid-2"]
    }
  ],
  "proposed_projects": [
    {
      "name": "Project name",
      "summary": "What this project is about",
      "related_action_indices": [0, 1]
    }
  ],
  "remaining_notes": [
    {
      "text": "Original or lightly cleaned text",
      "original_id": "item-uuid"
    }
  ]
}`

export async function runDigest(items: InboxItem[]): Promise<DigestOutput> {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  })

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: USER_PROMPT(items),
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from Claude')
  }

  // Strip any accidental markdown fences
  const jsonText = content.text.replace(/```json\n?|```\n?/g, '').trim()
  
  let parsed: DigestOutput
  try {
    parsed = JSON.parse(jsonText)
  } catch (e) {
    throw new Error(`Failed to parse Claude response as JSON: ${jsonText.substring(0, 200)}`)
  }

  return parsed
}

export const MODEL_VERSION = 'claude-sonnet-4-20250514'
