/**
 * Didi Anolue Consulting — Anthropic API Proxy
 * POST /api/generate-posts
 *
 * Required env var (set in Vercel dashboard):
 *   ANTHROPIC_API_KEY
 */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  const { theme, context, tone, weekDate, previousThemes } = req.body;
  if (!theme) return res.status(400).json({ error: 'Missing theme' });
  const previousNote = previousThemes?.length
    ? `\nPREVIOUSLY COVERED THEMES (avoid repeating these angles):\n${previousThemes.slice(0, 6).map(t => `- ${t}`).join('\n')}\n`
    : '';
  const prompt = `You are the social media editor for Didi Anolue Consulting, a boutique consultancy led by Didi Anolue — a Transformational Commercial Leader specialising in commercial contracts and procurement, with deep expertise in the UK public sector. The consultancy helps organisations optimise their procurement strategies, manage complex contracts, and build high-performing commercial teams.
Audience: procurement professionals, commercial directors, finance and operations leads, public sector procurement officers, and business leaders across the UK who want thought leadership on procurement, contracts, and commercial transformation.
CAMPAIGN BRIEF:
Week commencing: ${weekDate || 'this week'}
Theme: ${theme}
Additional context: ${context || 'None'}
Tone: ${tone}
${previousNote}
PLATFORM WRITING RULES — follow these strictly, each platform must read completely differently:
FACEBOOK (professional community):
- Length: 120–180 words in the caption body
- Style: Warm, professional, accessible — speaking to procurement practitioners and business owners
- Structure: Open with a relatable insight or question, then 2–3 short paragraphs of practical value, close with a question to drive comments
- Voice: First-person or inclusive ("We often see...", "Have you experienced...")
- NO emojis in the caption body
- End with a genuine question the audience will want to engage with
INSTAGRAM (visual thought leadership):
- Length: 50–80 words maximum in the caption body
- Style: Punchy, quotable, visually led — write as if the caption accompanies a bold graphic or pull-quote
- Structure: Strong single-line hook, then 2–3 short punchy lines of insight, close with a call to action
- Voice: Direct and confident
- Emojis: 3–5 woven naturally into the caption
- Hashtags: 8–12 relevant procurement/business tags
LINKEDIN (professional thought leadership):
- Length: 200–280 words in the caption body
- Style: Authoritative, data-led, suitable for senior procurement professionals and public sector leaders
- Structure: Strong insight or statistic as opener, then 2–3 paragraphs of analysis, close with a forward-looking question
- Voice: Expert and credible
- NO emojis anywhere
- Hashtags: 5–7 professional procurement tags only
Return ONLY valid JSON in exactly this structure (no markdown, no code fences):
{
  "findings": [
    "Specific current insight or trend relevant to this procurement/commercial theme",
    "Second relevant research finding or sector statistic",
    "Third relevant finding"
  ],
  "days": [
    {
      "day": "Monday",
      "posts": [
        {
          "platform": "facebook",
          "caption": "Full Facebook caption here",
          "hashtags": "#Procurement #CommercialContracts #PublicSector #ContractManagement #BusinessLeadership",
          "bestTime": "9:00am",
          "scheduledDate": "${weekDate}"
        },
        {
          "platform": "instagram",
          "caption": "Short punchy Instagram caption here",
          "hashtags": "#Procurement #Contracts #CommercialLeadership #PublicSector #BusinessGrowth #UKBusiness #SupplyChain #ContractManagement #ProcurementProfessionals #CommercialStrategy",
          "bestTime": "12:00pm",
          "scheduledDate": "${weekDate}"
        },
        {
          "platform": "linkedin",
          "caption": "Professional LinkedIn post here",
          "hashtags": "#Procurement #CommercialContracts #PublicSectorProcurement #ContractManagement #CommercialLeadership",
          "bestTime": "8:00am",
          "scheduledDate": "${weekDate}"
        }
      ]
    }
  ]
}
Generate all 5 days: Monday, Tuesday, Wednesday, Thursday, Friday. Each day should explore a different angle or sub-theme within the overall weekly theme. Each platform post must be genuinely distinct — not the same text reformatted.`;
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 6000,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await response.json();
    if (data.error) return res.status(502).json({ error: 'Anthropic API error', details: data.error });
    let raw = '';
    for (const block of (data.content || [])) {
      if (block.type === 'text') raw += block.text;
    }
    if (!raw) return res.status(502).json({ error: 'Empty response from Anthropic' });
    const clean = raw.replace(/```json|```/g, '').trim();
    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'Could not parse JSON from response' });
    return res.status(200).json(JSON.parse(match[0]));
  } catch (err) {
    console.error('Generate posts error:', err);
    return res.status(500).json({ error: 'Internal proxy error', message: err.message });
  }
}
