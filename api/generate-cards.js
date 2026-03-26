export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { releases } = req.body;
  if (!releases || !Array.isArray(releases) || releases.length === 0) {
    return res.status(400).json({ error: 'No releases provided' });
  }

  // 릴리즈 노트에서 주요 기능만 추출
  const features = [];
  for (const r of releases) {
    const lines = (r.body || '').split('\n')
      .filter(l => /^[\-\*]\s/.test(l))
      .map(l => l.replace(/^[\-\*]\s*/, '').trim())
      .filter(l => /^(Added|Increased|Re-introduced|Changed)\b/i.test(l));

    if (lines.length > 0) {
      features.push({
        version: r.tag_name,
        date: new Date(r.published_at).toLocaleDateString('ko-KR'),
        lines
      });
    }
  }

  if (features.length === 0) {
    return res.json({ cards: null, reason: 'no-notable-features' });
  }

  const featureSummary = features.map(f =>
    `### ${f.version} (${f.date})\n${f.lines.map(l => `- ${l}`).join('\n')}`
  ).join('\n\n');

  const prompt = `너는 Claude Code 한국어 팁 사이트의 콘텐츠 작성자야.
아래는 Claude Code의 새 릴리즈에서 추가된 주요 기능들이야.
이걸 기반으로 "최근에 나온 것들" 섹션에 들어갈 HTML 카드를 만들어줘.

규칙:
1. 사소한 환경변수 추가, 마이너한 설정 옵션은 카드로 만들지 마. 사용자가 실제로 체감하는 주요 기능만.
2. 한국어로, 반말+친근한 톤 (예: "~하는 거", "~할 수 있음")
3. 기존 카드 스타일을 정확히 따라야 해. 아래 예시처럼:

<example>
<!-- Feature Name — 날짜 -->
<div class="card">
  <div class="card-header" onclick="toggle(this)">
    <span class="card-icon">이모지</span>
    <div class="card-title">
      <h3>기능 이름 — 한줄 설명<span class="new-dot"></span></h3>
      <p>좀 더 자세한 설명. 이게 왜 좋은지.</p>
      <div class="card-tags"><span class="tag tag-pink">NEW</span><span class="tag tag-purple">카테고리</span><span class="date">날짜 · 버전</span></div>
    </div>
    <span class="card-arrow">›</span>
  </div>
  <div class="card-body">
    <h4>설명 제목</h4>
    <p>또는 ul/li로 설명</p>
    <h4>사용법</h4>
<pre class="code"><button class="cp" onclick="copyCode(this)">복사</button><span class="c-d"># 코멘트</span>
<span class="c-p">/command</span> <span class="c-g">예시</span></pre>
  </div>
</div>
</example>

4. 태그 클래스: tag-pink(NEW), tag-purple(카테고리), tag-green(실용적), tag-blue(VSCode/MCP 등), tag-red(자주쓰임), tag-orange(자동화)
5. 코드 블록 내 span 클래스: c-d(주석 회색), c-p(명령어 보라), c-g(텍스트 초록), c-b(굵은 파랑), c-o(옵션 주황)
6. 여러 버전의 기능이라도 주제가 비슷하면 하나의 카드로 합쳐도 됨
7. 정말 주목할만한 기능(자주 쓰이거나 임팩트 큰 것)에는 class="card featured"를 사용
8. 카드만 출력해. 다른 설명이나 마크다운 없이 순수 HTML만.

새 릴리즈 내용:
${featureSummary}`;

  try {
    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!apiRes.ok) {
      const err = await apiRes.text();
      return res.status(502).json({ error: `Claude API error: ${apiRes.status}`, detail: err });
    }

    const data = await apiRes.json();
    let cards = data.content[0].text.trim();
    cards = cards.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();

    return res.json({ cards, version: releases[0].tag_name });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
