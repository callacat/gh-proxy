// proxy-core.test.mjs — 核心逻辑单元测试
import { extractGitHubUrl, isAllowedRedirect } from '../src/proxy-core.js';

let passed = 0;
let total = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    console.log(`  ❌ ${name} — ${e.message}`);
  }
}

function assertEqual(actual, expected, msg) {
  if (actual !== expected) throw new Error(`${msg}: expected ${expected}, got ${actual}`);
}

// --- extractGitHubUrl ---
console.log('\n📦 extractGitHubUrl');

const urlTests = [
  ['/https://github.com/user/repo/releases/download/v1.0.0/app.zip',
   'https://github.com/user/repo/releases/download/v1.0.0/app.zip'],
  ['/https://github.com/user/repo/raw/main/README.md',
   'https://github.com/user/repo/raw/main/README.md'],
  ['https://github.com/user/repo/archive/refs/tags/v1.0.0.tar.gz',
   'https://github.com/user/repo/archive/refs/tags/v1.0.0.tar.gz'],
  ['/github/user/repo', 'https://github.com/user/repo'],
  ['/gh/user/repo.git', 'https://github.com/user/repo.git'],
  ['/gh/user/repo/archive/refs/heads/main.zip', 'https://github.com/user/repo/archive/refs/heads/main.zip'],
  ['/github/user/repo/zipball/main', 'https://github.com/user/repo/zipball/main'],
  ['/github/user/repo/tarball/main', 'https://github.com/user/repo/tarball/main'],
  ['/random/path', null],
  ['/https://gitlab.com/user/repo', null],
  ['/https:/github.com/user/repo', 'https://github.com/user/repo'],
];

for (const [input, expected] of urlTests) {
  test(`extract('${input.slice(0, 50)}') → ${expected || 'null'}`, () => {
    assertEqual(extractGitHubUrl(input), expected, 'extractGitHubUrl');
  });
}

// --- isAllowedRedirect ---
console.log('\n🔄 isAllowedRedirect');

const redirectTests = [
  ['https://objects.githubusercontent.com/xxx', true],
  ['https://raw.githubusercontent.com/user/repo/branch/file', true],
  ['https://codeload.github.com/user/repo/tar.gz/refs', true],
  ['https://example.com/bad', false],
  ['https://github.com/user/repo', true],
  ['invalid-url', false],
];

for (const [url, expected] of redirectTests) {
  test(`redirect('${url.slice(0, 50)}') → ${expected}`, () => {
    assertEqual(isAllowedRedirect(url), expected, 'isAllowedRedirect');
  });
}

// --- 空/边界情况 ---
console.log('\n🧪 边界情况');
test('null input → null', () => assertEqual(extractGitHubUrl(null), null));
test('empty string → null', () => assertEqual(extractGitHubUrl(''), null));
test('no match → null', () => assertEqual(extractGitHubUrl('/foo/bar'), null));

console.log(`\n📊 结果: ${passed}/${total} passed`);
process.exit(passed === total ? 0 : 1);
