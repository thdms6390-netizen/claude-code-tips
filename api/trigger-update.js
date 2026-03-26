export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const GITHUB_TOKEN = process.env.GITHUB_PAT;
  if (!GITHUB_TOKEN) return res.status(500).json({ error: 'GitHub token not configured' });

  const repo = 'thdms6390-netizen/claude-code-tips';
  const headers = {
    'Authorization': `token ${GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };

  try {
    // 이미 실행 중인 워크플로우가 있는지 확인
    const runsRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?status=in_progress&per_page=5`,
      { headers }
    );
    const runsData = await runsRes.json();
    const running = (runsData.workflow_runs || []).some(
      r => r.name === 'Update Feature Cards'
    );

    if (running) {
      return res.json({ triggered: false, reason: 'already-running' });
    }

    // 최근 10분 내 완료된 실행이 있는지 확인 (중복 방지)
    const recentRes = await fetch(
      `https://api.github.com/repos/${repo}/actions/runs?status=completed&per_page=5`,
      { headers }
    );
    const recentData = await recentRes.json();
    const recentRun = (recentData.workflow_runs || []).find(
      r => r.name === 'Update Feature Cards'
    );
    if (recentRun) {
      const completedAt = new Date(recentRun.updated_at).getTime();
      if (Date.now() - completedAt < 10 * 60 * 1000) {
        return res.json({ triggered: false, reason: 'recently-completed' });
      }
    }

    // GitHub Action 트리거
    const ghRes = await fetch(
      `https://api.github.com/repos/${repo}/dispatches`,
      {
        method: 'POST',
        headers,
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
