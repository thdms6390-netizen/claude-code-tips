export default async function handler(req, res) {
  const token = process.env.GITHUB_PAT;
  if (!token) {
    return res.status(500).json({ error: 'GitHub token not configured' });
  }

  // 최신 워크플로우 실행 상태 확인
  const runsRes = await fetch(
    'https://api.github.com/repos/thdms6390-netizen/claude-code-tips/actions/workflows/update-features.yml/runs?per_page=1',
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );

  if (!runsRes.ok) {
    return res.status(runsRes.status).json({ error: 'Failed to fetch workflow runs' });
  }

  const runs = await runsRes.json();
  const latest = runs.workflow_runs?.[0];

  if (!latest) {
    return res.status(200).json({ status: 'unknown' });
  }

  // 최신 릴리즈 버전도 같이 반환
  const releaseRes = await fetch(
    'https://api.github.com/repos/anthropics/claude-code/releases?per_page=1',
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    }
  );

  let latestVersion = null;
  if (releaseRes.ok) {
    const releases = await releaseRes.json();
    if (releases[0]) latestVersion = releases[0].tag_name;
  }

  return res.status(200).json({
    status: latest.status,           // queued, in_progress, completed
    conclusion: latest.conclusion,   // success, failure, etc.
    latestVersion,
  });
}
