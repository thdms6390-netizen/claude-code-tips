export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const GITHUB_TOKEN = process.env.GITHUB_PAT;
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });

  try {
    const ghRes = await fetch(
      'https://api.github.com/repos/thdms6390-netizen/claude-code-tips/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ event_type: 'new-release' })
      }
    );

    if (!ghRes.ok) {
      const err = await ghRes.text();
      return res.status(502).json({ error: `GitHub API error: ${ghRes.status}`, detail: err });
    }

    return res.json({ triggered: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
