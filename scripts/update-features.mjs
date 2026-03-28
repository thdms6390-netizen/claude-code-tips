#!/usr/bin/env node

/**
 * 새 Claude Code 릴리즈가 나오면 Claude API로 한국어 기능 카드를 생성하고
 * index.html에 삽입하는 스크립트
 *
 * 소스 2가지:
 * 1. GitHub Releases (CLI 릴리즈)
 * 2. Anthropic 블로그 (별도 제품 발표)
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const INDEX_PATH = resolve(__dirname, '../public/index.html');
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY 환경변수가 필요합니다.');
  process.exit(1);
}

// 1. 현재 KNOWN_VERSION / KNOWN_BLOG_DATE 읽기
function getKnownVersion(html) {
  const match = html.match(/const KNOWN_VERSION\s*=\s*'([^']+)'/);
  return match ? match[1] : null;
}

function getKnownBlogDate(html) {
  const match = html.match(/const KNOWN_BLOG_DATE\s*=\s*'([^']+)'/);
  return match ? match[1] : '2026-03-25'; // 기본값: 현재까지 수동 반영된 날짜
}

// 2. GitHub에서 최신 릴리즈 가져오기
async function fetchNewReleases(knownVersion) {
  const res = await fetch(
    'https://api.github.com/repos/anthropics/claude-code/releases?per_page=15',
    { headers: { 'User-Agent': 'claude-code-tips-bot' } }
  );
  if (!res.ok) throw new Error(`GitHub API error: ${res.status}`);
  const releases = await res.json();

  return releases.filter(r => !r.prerelease && r.tag_name > knownVersion);
}

// 2-2. Anthropic 블로그에서 Claude Code 관련 새 글 가져오기
async function fetchNewBlogPosts(knownBlogDate) {
  console.log(`📰 블로그 확인 중... (기준일: ${knownBlogDate})`);
  const res = await fetch('https://www.anthropic.com/news', {
    headers: { 'User-Agent': 'claude-code-tips-bot' }
  });
  if (!res.ok) {
    console.log(`⚠️ 블로그 접근 실패: ${res.status}. 건너뜀.`);
    return [];
  }

  const html = await res.text();

  // 블로그 목록에서 링크, 날짜, 제목 추출
  const pattern = /href="(\/news\/[^"]+)"[^>]*>.*?<time[^>]*>([^<]+)<\/time>.*?<h4[^>]*>([^<]+)<\/h4>.*?<p[^>]*>([^<]*)<\/p>/gs;
  const posts = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const [, url, rawDate, title, desc] = match;
    // "Mar 24, 2026" → "2026-03-24"
    const date = new Date(rawDate.trim());
    const isoDate = date.toISOString().split('T')[0];

    if (isoDate > knownBlogDate) {
      posts.push({ url: `https://www.anthropic.com${url}`, date: isoDate, title: title.trim(), desc: desc.trim() });
    }
  }

  if (posts.length === 0) {
    console.log('📰 새 블로그 글 없음.');
    return [];
  }

  // 각 글의 본문을 가져와서 Claude Code 관련인지 필터링
  const claudeCodePosts = [];
  for (const post of posts) {
    try {
      const postRes = await fetch(post.url, { headers: { 'User-Agent': 'claude-code-tips-bot' } });
      if (!postRes.ok) continue;
      const postHtml = await postRes.text();

      // 본문에서 텍스트만 대략 추출 (태그 제거)
      const bodyText = postHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 5000); // 앞부분 5000자만

      // Claude Code 관련 키워드 체크
      const lower = bodyText.toLowerCase();
      const isClaudeCode = ['claude code', 'claude-code', 'computer use', 'claude desktop', 'mcp server', 'tool use'].some(k => lower.includes(k));

      if (isClaudeCode) {
        post.bodyExcerpt = bodyText.slice(0, 3000);
        claudeCodePosts.push(post);
        console.log(`  📝 관련 글 발견: ${post.title} (${post.date})`);
      }
    } catch (e) {
      console.log(`  ⚠️ ${post.url} 읽기 실패: ${e.message}`);
    }
  }

  return claudeCodePosts;
}

// 2-3. 블로그 글로 카드 생성 (기능/소식 분류 포함)
async function generateBlogCards(posts) {
  if (posts.length === 0) return { featureCards: null, newsCards: null };

  const postSummary = posts.map(p =>
    `### ${p.title} (${p.date})\nURL: ${p.url}\n설명: ${p.desc}\n본문 발췌:\n${p.bodyExcerpt}`
  ).join('\n\n---\n\n');

  const prompt = `너는 Claude Code 한국어 팁 사이트의 콘텐츠 작성자야.
아래는 Anthropic 블로그에서 발표된 Claude Code 관련 새 글이야.

각 글을 분류해서 카드를 만들어줘:
- **기능 소개** (새 기능, 모델 출시, 성능 개선 등 사용자가 직접 쓸 수 있는 것) → "FEATURE_CARDS" 블록에
- **소식** (인수, 마일스톤, 파트너십, 오픈소스 기부, 조직 변경 등) → "NEWS_CARDS" 블록에

출력 형식:
<!-- FEATURE_CARDS_START -->
(기능 카드들 여기에)
<!-- FEATURE_CARDS_END -->
<!-- NEWS_CARDS_START -->
(소식 카드들 여기에)
<!-- NEWS_CARDS_END -->

카드 규칙:
1. 한국어로, 반말+친근한 톤
2. 기존 카드 스타일을 따라:

<example>
<div class="card">
  <div class="card-header" onclick="toggle(this)">
    <span class="card-icon">이모지</span>
    <div class="card-title">
      <h3>기능 이름 — 한줄 설명<span class="new-dot"></span></h3>
      <p>좀 더 자세한 설명.</p>
      <div class="card-tags"><span class="tag tag-pink">NEW</span><span class="tag tag-purple">카테고리</span><span class="date">날짜 · 별도 제품 발표</span></div>
    </div>
    <span class="card-arrow">›</span>
  </div>
  <div class="card-body">
    <h4>설명</h4>
    <ul><li>내용</li></ul>
    <p><a href="블로그URL" target="_blank">공식 블로그 →</a></p>
  </div>
</div>
</example>

3. 태그 클래스: tag-pink(NEW), tag-purple(카테고리), tag-green(실용적), tag-blue(VSCode/MCP 등), tag-red(자주쓰임/보안), tag-orange(자동화/인수)
4. 코드 블록 내 span: c-d(주석), c-p(명령어), c-g(텍스트), c-b(굵은파랑), c-o(옵션)
5. 날짜 옆에 "별도 제품 발표" 표기
6. 주목할만한 것은 class="card featured"
7. 카드 HTML만 출력. 마크다운 없이.
8. Claude Code와 관련 없으면 해당 블록을 비워둬.

블로그 글:
${postSummary}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error (blog): ${res.status} ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim()
    .replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();

  // 기능 카드와 소식 카드 분리
  const featureMatch = text.match(/<!-- FEATURE_CARDS_START -->([\s\S]*?)<!-- FEATURE_CARDS_END -->/);
  const newsMatch = text.match(/<!-- NEWS_CARDS_START -->([\s\S]*?)<!-- NEWS_CARDS_END -->/);

  const featureCards = featureMatch ? featureMatch[1].trim() : null;
  const newsCards = newsMatch ? newsMatch[1].trim() : null;

  return {
    featureCards: featureCards && featureCards.includes('class="card') ? featureCards : null,
    newsCards: newsCards && newsCards.includes('class="card') ? newsCards : null
  };
}

// 5-2. 소식 탭에 카드 삽입
function insertNewsCards(html, cardsHtml) {
  // "Anthropic 블로그 소식" 섹션 헤더 다음, 첫 카드 앞에 삽입
  const marker = '<p>Claude Code 관련 공식 발표, 인수, 파트너십 소식 모음</p>\n</div>';
  const idx = html.indexOf(marker);
  if (idx === -1) {
    console.log('⚠️ 소식 탭 삽입 위치를 찾을 수 없습니다. 건너뜀.');
    return html;
  }
  const insertAt = idx + marker.length;
  html = html.slice(0, insertAt) + '\n\n' + cardsHtml + '\n\n' + html.slice(insertAt);
  return html;
}

// 3. 릴리즈 노트에서 주요 기능만 추출 (버그픽스 제외)
function extractNotableFeatures(releases) {
  const features = [];

  for (const r of releases) {
    const body = r.body || '';
    const lines = body.split('\n')
      .filter(l => /^[\-\*]\s/.test(l))
      .map(l => l.replace(/^[\-\*]\s*/, '').trim())
      .filter(l =>
        /^Added\b/i.test(l) ||
        /^Increased\b/i.test(l) ||
        /^Re-introduced\b/i.test(l) ||
        /^Changed\b/i.test(l)
      )
      // 너무 사소한 것 제외
      .filter(l => !l.match(/^Fixed\b/i));

    if (lines.length > 0) {
      features.push({
        version: r.tag_name,
        date: new Date(r.published_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' }),
        isoDate: r.published_at.split('T')[0],
        name: r.name || r.tag_name,
        url: r.html_url,
        lines
      });
    }
  }

  return features;
}

// 4. Claude API로 한국어 카드 HTML 생성
async function generateCards(features) {
  if (features.length === 0) return null;

  const featureSummary = features.map(f =>
    `### ${f.version} (${f.date})\nRelease URL: ${f.url}\n${f.lines.map(l => `- ${l}`).join('\n')}`
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
8. 카드 body 마지막에 릴리즈 노트 바로가기 링크를 넣어: <p><a href="릴리즈URL" target="_blank">릴리즈 노트 →</a></p>
9. 카드만 출력해. 다른 설명이나 마크다운 없이 순수 HTML만.

새 릴리즈 내용:
${featureSummary}`;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();

  // HTML만 추출 (혹시 ```html 등이 감싸고 있으면 제거)
  return text.replace(/^```html\n?/, '').replace(/\n?```$/, '').trim();
}

// 5. index.html에 카드 삽입
function insertCards(html, cardsHtml, newVersion) {
  // AUTO_INSERT_MARKER 바로 다음에 삽입
  const marker = '<!-- AUTO_INSERT_MARKER -->';
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error('삽입 위치를 찾을 수 없습니다 (AUTO_INSERT_MARKER 없음)');
  const insertAt = idx + marker.length;
  html = html.slice(0, insertAt) + '\n' + cardsHtml + '\n' + html.slice(insertAt);

  // KNOWN_VERSION 업데이트
  html = html.replace(
    /const KNOWN_VERSION\s*=\s*'[^']+'/,
    `const KNOWN_VERSION = '${newVersion}'`
  );

  return html;
}

// 메인
async function main() {
  console.log('📦 index.html 읽는 중...');
  let html = readFileSync(INDEX_PATH, 'utf-8');
  const knownVersion = getKnownVersion(html);
  const knownBlogDate = getKnownBlogDate(html);
  console.log(`📌 현재 KNOWN_VERSION: ${knownVersion}`);
  console.log(`📌 현재 KNOWN_BLOG_DATE: ${knownBlogDate}`);

  let updated = false;
  let latestVersion = knownVersion;

  // === 소스 1: GitHub Releases ===
  console.log('\n🔍 새 릴리즈 확인 중...');
  const newReleases = await fetchNewReleases(knownVersion);

  if (newReleases.length > 0) {
    console.log(`🆕 새 릴리즈 ${newReleases.length}개 발견: ${newReleases.map(r => r.tag_name).join(', ')}`);
    latestVersion = newReleases[0].tag_name;

    const features = extractNotableFeatures(newReleases);
    if (features.length === 0) {
      console.log('ℹ️ 주요 기능 변경 없음 (버그 픽스만). 버전만 업데이트.');
    } else {
      console.log(`🤖 Claude API로 릴리즈 카드 생성 중... (${features.reduce((a, f) => a + f.lines.length, 0)}개 항목)`);
      const cardsHtml = await generateCards(features);
      if (cardsHtml) {
        html = insertCards(html, cardsHtml, latestVersion);
        updated = true;
        console.log(`✅ 릴리즈 카드 ${features.length}개 추가.`);
      }
    }

    // KNOWN_VERSION 업데이트 (카드 없어도 버전은 갱신)
    html = html.replace(
      /const KNOWN_VERSION\s*=\s*'[^']+'/,
      `const KNOWN_VERSION = '${latestVersion}'`
    );
    updated = true;
  } else {
    console.log('✅ 새 릴리즈 없음.');
  }

  // === 소스 2: Anthropic 블로그 ===
  console.log('\n📰 블로그 확인 중...');
  const blogPosts = await fetchNewBlogPosts(knownBlogDate);

  if (blogPosts.length > 0) {
    console.log(`🤖 Claude API로 블로그 카드 생성 중... (${blogPosts.length}개 글)`);
    const { featureCards, newsCards } = await generateBlogCards(blogPosts);

    if (featureCards) {
      html = insertCards(html, featureCards, latestVersion);
      console.log(`✅ 블로그 기능 카드 → 최신 기능 탭에 추가.`);
    }
    if (newsCards) {
      html = insertNewsCards(html, newsCards);
      console.log(`✅ 블로그 소식 카드 → 소식 탭에 추가.`);
    }

    // KNOWN_BLOG_DATE 업데이트
    const latestBlogDate = blogPosts[0].date;
    if (html.includes('KNOWN_BLOG_DATE')) {
      html = html.replace(
        /const KNOWN_BLOG_DATE\s*=\s*'[^']+'/,
        `const KNOWN_BLOG_DATE = '${latestBlogDate}'`
      );
    }
    updated = true;
  }

  if (!updated) {
    console.log('\n✅ 업데이트 없음. 종료.');
    process.exit(0);
  }

  writeFileSync(INDEX_PATH, html);
  console.log(`\n✅ 완료! KNOWN_VERSION → ${latestVersion}`);

  // GitHub Actions output
  if (process.env.GITHUB_OUTPUT) {
    const { appendFileSync } = await import('fs');
    appendFileSync(process.env.GITHUB_OUTPUT, `updated=true\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `version=${latestVersion}\n`);
    appendFileSync(process.env.GITHUB_OUTPUT, `count=${newReleases.length + blogPosts.length}\n`);
  }
}

main().catch(e => {
  console.error('❌ 에러:', e.message);
  process.exit(1);
});
