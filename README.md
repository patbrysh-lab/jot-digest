# Jot Digest

A cloud-synced idea inbox where you can dump thoughts all day, then run an AI digest that turns them into suggested action items and grouped projects. Nothing becomes an official task until you approve it.

## File Tree

```
jot-digest/
├── app/
│   ├── (app)/                    # Authenticated app routes (layout with bottom nav)
│   │   ├── layout.tsx            # Auth guard + bottom nav wrapper
│   │   ├── inbox/page.tsx        # Quick-add + inbox list with search/filter
│   │   ├── digest/page.tsx       # Date range picker + Run Digest
│   │   ├── review/[digestRunId]/ # Post-digest review: Actions | Projects | Notes
│   │   └── approved/page.tsx     # Approved actions with status/priority controls
│   ├── api/
│   │   ├── digest/route.ts       # POST: fetch items → Claude → save digest + proposals
│   │   └── actions/approve/      # POST: promote proposed → approved action
│   ├── auth/page.tsx             # Sign in / Sign up
│   ├── layout.tsx                # Root HTML layout
│   ├── page.tsx                  # Redirects to /inbox or /auth
│   └── globals.css               # Tailwind + custom design tokens
├── components/
│   └── BottomNav.tsx             # Mobile bottom navigation
├── lib/
│   ├── claude.ts                 # Anthropic SDK + digest prompt
│   ├── supabase-client.ts        # Browser Supabase client
│   └── supabase-server.ts        # Server Supabase client (SSR)
├── types/
│   └── index.ts                  # TypeScript types for all entities
├── supabase/
│   └── migrations.sql            # Full schema + RLS policies
├── .env.local.example            # Environment variable template
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
└── package.json
```

## Tech Stack

- **Framework**: Next.js 14 (App Router, TypeScript)
- **Styling**: Tailwind CSS — custom design system with paper/ink aesthetic
- **Auth + DB**: Supabase (Postgres + Row Level Security)
- **AI**: Anthropic Claude API (claude-sonnet-4-20250514)
- **Date handling**: date-fns

## Setup

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)
- An [Anthropic](https://console.anthropic.com) API key

### 1. Clone and install

```bash
git clone <repo>
cd jot-digest
npm install
```

### 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the entire contents of `supabase/migrations.sql`
3. Go to **Settings → API** and copy your:
   - Project URL
   - Anon/Public key

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
ANTHROPIC_API_KEY=sk-ant-api03-your-key
```

> ⚠️ `ANTHROPIC_API_KEY` is used only in server-side API routes. Never prefix it with `NEXT_PUBLIC_`.

### 4. Enable email auth in Supabase

Go to **Authentication → Providers** and ensure **Email** is enabled. For local development, you can disable email confirmation under **Authentication → Email Templates → Confirm signup**.

### 5. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Using the App

### Inbox

- Type any thought, idea, task, or note in the quick-add field
- Add comma-separated tags (optional)
- Press **Add** or ⌘+Enter
- Use search and tag filters to browse items
- Archive items to remove them from inbox (they won't be included in future digests)

### Running a Digest

1. Go to **Digest** tab
2. Select a date range (or use a quick preset like "Last week")
3. The item count preview shows how many items will be processed
4. Click **Run Digest** — Claude processes your inbox and returns structured proposals

### Reviewing Results

After a digest, you're taken to the **Review** screen with three tabs:

- **Actions** — Proposed action items from Claude
  - **Approve**: Moves to your approved actions list
  - **Edit**: Inline title/details editing before approving
  - **Reject**: Dismisses the action
  - **Merge Mode**: Select two actions to combine them
- **Projects** — Thematic clusters Claude identified, referencing related actions
- **Notes** — Items Claude determined weren't actionable

### Approved Actions

Your confirmed task list with:
- **Done toggle** (circle checkbox)
- **Priority selector**: Low / Med / High
- **Due date** picker
- **Snooze** toggle
- Filter by Active / Snoozed / Done / All

## Security & Privacy

- All data is scoped to authenticated users via Supabase Row Level Security
- The Claude API key is server-side only (in API routes, never sent to the browser)
- Raw inbox text is not logged to console in production

## Extending with Google Calendar Integration

When you're ready to add Calendar sync in V2, here's the architecture:

### Data Model Changes
Add `calendar_event_id TEXT` and `calendar_synced_at TIMESTAMPTZ` columns to `approved_actions`.

### OAuth Flow
1. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to env
2. Create `/app/api/auth/google/route.ts` — initiate OAuth flow
3. Create `/app/api/auth/google/callback/route.ts` — exchange code for tokens
4. Store refresh tokens in a `user_integrations` table (encrypted at rest)

### Sync Logic
Create `/lib/google-calendar.ts`:
```typescript
export async function createCalendarEvent(action: ApprovedAction, accessToken: string) {
  // POST https://www.googleapis.com/calendar/v3/calendars/primary/events
  // Map: action.title → summary, action.due_date → start/end, action.details → description
}
```

### UI Changes
- Add "Sync to Calendar" button on `ApprovedCard` (only visible if action has a due_date)
- Add a "Connected Integrations" section in a settings page
- Show a calendar icon badge on approved actions that have been synced

### Webhook (optional)
Subscribe to Google Calendar push notifications to mark actions as done when calendar events are completed.
