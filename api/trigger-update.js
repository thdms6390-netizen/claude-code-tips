export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.GITHUB_PAT;
  if (!token) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  const response = await fetch(
    'https://api.github.com/repos/thdms6390-netizen/claude-code-tips/actions/workflows/update-features.yml/dispatches',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  );

  if (response.status === 204) {
    return res.status(200).json({ ok: true });
  }

  const body = await response.text();
  return res.status(response.status).json({ error: body });
}
