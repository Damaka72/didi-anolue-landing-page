/**
 * Didi Anolue Consulting — Buffer API Proxy
 * POST /api/buffer-post
 *
 * Required env vars (set in Vercel dashboard):
 *   BUFFER_API_KEY          — your Buffer access token
 *   BUFFER_LINKEDIN_ID      — Buffer channel ID for LinkedIn
 *   BUFFER_INSTAGRAM_ID     — Buffer channel ID for Instagram
 *   BUFFER_FACEBOOK_ID      — Buffer channel ID for Facebook
 */
const BUFFER_GRAPHQL = 'https://api.buffer.com/graphql';
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.BUFFER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'No Buffer API key — set BUFFER_API_KEY in Vercel env vars' });
  }
  const CHANNEL_IDS = {
    linkedin:  process.env.BUFFER_LINKEDIN_ID,
    instagram: process.env.BUFFER_INSTAGRAM_ID,
    facebook:  process.env.BUFFER_FACEBOOK_ID,
  };
  const { text, scheduledAt, platform, day, mediaUrl } = req.body;
  if (!text) return res.status(400).json({ error: 'Missing required field: text' });
  const platformKey = (platform || '').toLowerCase();
  const channelId = CHANNEL_IDS[platformKey];
  if (!channelId) {
    return res.status(400).json({
      error: `Unknown platform or missing env var for: "${platform}". Check BUFFER_LINKEDIN_ID, BUFFER_INSTAGRAM_ID, BUFFER_FACEBOOK_ID in Vercel.`
    });
  }
  if (platformKey === 'instagram' && !mediaUrl) {
    return res.status(200).json({
      success: false,
      skipped: true,
      platform: platformKey,
      reason: 'Instagram posts require an image or video. Add a photo/video URL to the card and re-send.',
      day
    });
  }
  try {
    const dueAt = scheduledAt || new Date(Date.now() + 3600 * 1000).toISOString();
    const LINKEDIN_CHAR_LIMIT = 1248;
    const postText = platformKey === 'linkedin' && text.length > LINKEDIN_CHAR_LIMIT
      ? text.slice(0, LINKEDIN_CHAR_LIMIT - 1) + '…'
      : text;
    const mutation = `
      mutation CreatePost($input: CreatePostInput!) {
        createPost(input: $input) {
          ... on PostActionSuccess {
            post { id }
          }
          ... on MutationError {
            message
          }
        }
      }
    `;
    const metadata = platformKey === 'facebook'
      ? { facebook: { type: 'post' } }
      : platformKey === 'instagram'
        ? { instagram: { type: 'post', shouldShareToFeed: true } }
        : undefined;
    const variables = {
      input: {
        channelId,
        text: postText,
        schedulingType: 'automatic',
        mode: 'customScheduled',
        dueAt,
        ...(metadata && { metadata }),
        ...(mediaUrl && { assets: { images: [{ url: mediaUrl }] } }),
      }
    };
    const postRes = await fetch(BUFFER_GRAPHQL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: mutation, variables })
    });
    const postData = await postRes.json();
    if (!postRes.ok) {
      return res.status(502).json({ error: 'Buffer API error', details: postData });
    }
    const result = postData?.data?.createPost;
    if (result?.message) {
      return res.status(502).json({ error: 'Buffer rejected post', details: result.message });
    }
    const postId = result?.post?.id;
    if (!postId) {
      return res.status(502).json({ error: 'Buffer returned no post ID', details: postData });
    }
    return res.status(200).json({ success: true, postId, scheduledAt: dueAt, platform: platformKey, day });
  } catch (err) {
    console.error('Buffer proxy error:', err);
    return res.status(500).json({ error: 'Internal proxy error', message: err.message });
  }
}
