import Anthropic from '@anthropic-ai/sdk'
import type { EnrichmentOutput, Item } from '@/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export const MODEL_VERSION = 'claude-sonnet-4-6'

const ENRICHMENT_SYSTEM = `You are an intelligent assistant that classifies and enriches captured notes, tasks, ideas, and URLs.

Analyze the given item and return a JSON object with exactly these fields:

- item_type: task | curiosity | content | event | idea | reference | catch_all
  task = something to do; curiosity = question/thing to look up; content = media to consume;
  event = time-bound occasion; idea = concept to develop; reference = info to save; catch_all = other

- context: work | personal | music | golf | travel | creative | unknown
  Infer from content. Default to "unknown" when genuinely unclear.

- effort: quick | session | project | null
  quick = <30 min; session = 30min–2hr; project = multi-session; null if non-task

- horizon: active | later | someday
  active = this week; later = next few weeks; someday = no timeline

- curiosity_score: 1–5 (how intellectually interesting)
- actionability_score: 1–5 (how clear and immediately actionable)
- time_sensitivity: 1–5 (how urgent or time-dependent)
- importance: 1–5 (how significant to goals or wellbeing)
- avoidance_score: 0–10 (0 = easy to start, 10 = highly likely to procrastinate)

- next_step: object with:
  - text: concrete, specific next action (1–2 sentences, immediately actionable)
  - type: action | explore | consume | develop | none
  - expires_in_days: number or null

- entities: array of { entity_type: person|place|company|artist|topic|brand, entity_value: string }
  Only include clearly identifiable entities. Empty array is fine.

- completion_mode: closes | branching | generative
  closes = clear binary end state (send email, book flight, delete file — task is simply done)
  branching = outcome changes what comes next (research task where result matters, decision to make)
  generative = completing it will surface new work (reading article, reviewing a codebase, attending event)

- possible_outcomes: array of 2–3 short outcome labels (max 22 chars each), only if branching; empty array otherwise
  e.g. ["Found it", "Didn't find it", "Partial"] or ["Yes", "No", "Need more info"]

- follow_up_templates: object keyed by each outcome with array of 1–3 concrete follow-up task titles
  Only populate if branching; empty object otherwise
  e.g. {"Found it": ["Add to reference list", "Share with team"], "Didn't find it": ["Try alternative source"]}

- reasoning: 1-sentence explanation of your classification

Rules:
- Be decisive. Use the full score range — not everything is a 3.
- Return ONLY valid JSON. No markdown fences, no explanation outside the JSON.`

export async function enrichItem(item: Item): Promise<EnrichmentOutput> {
  let content = ''
  if (item.raw_text) content += `Text: ${item.raw_text}\n`
  if (item.url) {
    content += `URL: ${item.url}\n`
    if (item.url_summary) {
      const s = item.url_summary
      if (s.title) content += `Title: ${s.title}\n`
      if (s.description) content += `Description: ${s.description}\n`
      if (s.siteName) content += `Site: ${s.siteName}\n`
      if (s.mainText) content += `Excerpt: ${s.mainText.slice(0, 800)}\n`
    }
  }

  const response = await anthropic.messages.create({
    model: MODEL_VERSION,
    max_tokens: 1024,
    system: ENRICHMENT_SYSTEM,
    messages: [{ role: 'user', content: content.trim() }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''
  const cleaned = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim()

  let parsed: EnrichmentOutput
  try {
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error(`Failed to parse Claude response: ${cleaned.slice(0, 200)}`)
  }

  return parsed
}
