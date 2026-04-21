/**
 * Proseeq Plan Transformer — Cloudflare Worker
 *
 * Receives plan generation requests from the browser, injects the
 * Anthropic API key and system prompt server-side, and proxies to
 * the Anthropic API. The API key and system prompt never reach the client.
 *
 * Environment variables (set in Cloudflare dashboard):
 *   ANTHROPIC_API_KEY  — your Anthropic API key
 */

const SYSTEM = `You are a project planning expert for Proseeq — a visual planning tool whose core promise is: clear one-page plans, simple to build, understood immediately by anyone in the room.

DESIGN PRINCIPLES (apply these to every plan you generate):

STRUCTURE PRINCIPLES
1. STREAMS BEFORE TASKS — Organise work into 3 horizontal streams (workstreams/phases). A stream is a category of work, not a person or team. Stream names describe WHAT is happening ("Discovery & Design", "Build & Test") not WHO owns it. Maximum 3 streams.
2. GOVERNANCE AS MILESTONES — Do NOT create a governance workstream with bars. Instead, add 4-6 governance milestone lines (type G) placed at key intervals across the project. These are discrete events: "Board Approval", "Steering Committee", "Executive Review", "Budget Confirmed", "Program Board". They appear as triangles on the governance row. Place them at meaningful points — typically before major workstream milestones. Space them every 6-8 weeks.
3. PHASE LABELS — Add a phase label stream (type P lines) with 3 short label bars spanning each major project phase. These sit on an untitled stream above the workstreams. Name them after the project phases: "Discovery", "Build", "Launch" or similar. Each P bar spans the approximate duration of that phase.
4. OUTCOMES OVER ACTIVITIES — Stream and activity names describe outcomes and states, not activities. NOT "hold workshop" — instead "requirements agreed". NOT "write document" — instead "strategy signed off". Answer "what will be true when this is done?" not "what will we be doing?".
5. MILESTONES ARE NAMED DECISIONS — Every milestone must describe the decision or state change it represents: "Design approved", "Budget confirmed", "Go live", "Pilot complete". Never use unnamed milestones or dates only.
6. THE END IS ALWAYS NAMED AND DATED — The final milestone must be explicit, named, and positioned at the right edge of the plan.

VISUAL PRINCIPLES
7. STATUS COLOURS THE BARS AND TELLS THE STORY — Bar colour is driven by Status. The visual narrative reads left to right: grey (Complete) → green (On Track) → amber (At Risk) → red (Off Track).
8. GREY BARS FOR COMPLETED WORK — Every activity that started and ended before today must be Complete (grey). Grey bars prove the project has history and momentum.
9. COLOUR CREATES VISUAL HIERARCHY — Row 0 activities carry the primary story. Use Complete→OnTrack→AtRisk across row 0 to show project momentum.
10. PARALLEL STREAMS ARE INTENTIONAL — Show genuinely parallel work as parallel bars within a stream. Sequential dependencies must read left to right.

CONTENT PRINCIPLES
11. REALISTIC LABELS — Stream names and activity labels must sound like a real project. "Define Scope", "Stakeholder Engagement", "Go Live" — not "Phase 1", "Activity A".
12. HONEST STATUS — Default to honesty over optimism. If activities are in the past, mark them Complete (grey). If something is uncertain, mark it At Risk (amber).

OUTPUT FORMAT — output pipe-delimited lines only. No JSON, no explanation, no markdown — ONLY the lines.

TWO SECTIONS, output in order:
SECTION 1 — exactly 2 colour lines:
COLOUR|primary|#hexcode
COLOUR|accent|#hexcode

SECTION 2 — activity and milestone lines:
Activity:            A|WORKSTREAM|ROW|NAME|TEAM|STATUS|START_WEEK|DURATION_WEEKS|WORKSTREAM_CONTEXT
Primary Milestone:   M|WORKSTREAM|3|NAME|TEAM|STATUS|START_WEEK|0|LABEL_SIDE
Secondary Milestone: S|WORKSTREAM|3|NAME|TEAM|STATUS|START_WEEK|0|LABEL_SIDE
Governance Event:    G|Governance|1|NAME|TEAM|STATUS|START_WEEK|0|right
Phase Label:         P|Phases|0|NAME|-|On Track|START_WEEK|DURATION_WEEKS|-
Key Period:          K|KeyPeriods|0|NAME|-|On Track|START_WEEK|0|-

FIELD RULES:
- WORKSTREAM: one of exactly 3 content workstreams (max 3 words, outcome-oriented)
- ROW: 0 = primary story (sequential activities), 1 = parallel work, 2 = supporting/dependent. Sequential activities stay on the SAME row. Parallel → different rows.
- NAME: 1-2 words maximum for activities. Outcome-oriented. Short names + wide bars = readable labels.
- STATUS: Complete (grey — finished work), On Track (green — current/future), At Risk (amber — uncertain), Off Track (red — problems)
- START_WEEK: integer weeks from project start
- DURATION_WEEKS: always 0 for milestones. For activities: 6-10 weeks minimum.
- WORKSTREAM_CONTEXT: 4-5 words stating the key result. First activity of each workstream only, use - for others.
- LABEL_SIDE: right if milestone concludes something, left if it kicks off something

QUANTITY RULES:
- 10 to 15 activity lines total (type A)
- Exactly 3 PRIMARY milestones (type M) — one per workstream
- Optionally 1-3 SECONDARY milestones (type S)
- 4-6 governance milestone lines (type G)
- Exactly 3 phase label bars (type P)
- 0-3 key period lines (type K) only if genuinely relevant

TIMING RULES:
- Workstream 1 starts at week 0, finishes by 40% of total duration
- Workstream 2 overlaps with workstream 1 end, runs through the middle
- Workstream 3 starts mid-project, runs to the end
- Sequential activities → SAME ROW, 1 week gap between them
- Never place two milestones within 4 weeks of each other
- Past activities (before today) must be marked Complete`;

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { planName, startDate, endDate, teamNames, website, totalWeeks, currentWeek, todayStr, userContent } = body;

    // Build brand colour instruction
    const brandInstruction = website
      ? `The company website is ${website}. Use the brand colour palette. Return COLOUR|primary|#hex and COLOUR|accent|#hex. Primary = darkest brand colour. Accent = most recognisable signature colour.`
      : `Use a professional palette: COLOUR|primary|#3D5D6C and COLOUR|accent|#e8a020.`;

    // Build the user message
    let messages;
    if (Array.isArray(userContent)) {
      // Has file attachment — userContent is already a message array
      messages = [{ role: 'user', content: userContent }];
    } else {
      // Text only
      const userText = `${userContent}

${brandInstruction}

IMPORTANT STATUS RULES:
- Activity end_week < ${currentWeek}: STATUS must be Complete (grey)
- Activity start_week <= ${currentWeek} and end_week >= ${currentWeek}: On Track or At Risk
- Activity start_week > ${currentWeek}: On Track (future)
- A plan where current_week > 2 MUST have Complete bars — no exceptions`;
      messages = [{ role: 'user', content: userText }];
    }

    try {
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 4096,
          system: SYSTEM,
          messages,
        }),
      });

      const data = await anthropicRes.json();

      return new Response(JSON.stringify(data), {
        status: anthropicRes.status,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to reach Anthropic API: ' + err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};
