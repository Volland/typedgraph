// Publish the Typed Graph Schema specification from spec/tgs/ into the site:
// spec/tgs/v<version>/ (rendered page plus source files), spec/tgs/ (redirect
// to the latest version) and ns/tgs/ (the namespace page for tgs: terms).
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';

const VERSION = '0.4';
const src = 'spec/tgs';
const out = `site/spec/tgs/v${VERSION}`;
// Earlier versions are immutable copies kept in spec/tgs/archive/v<version>/.
const archived = existsSync(`${src}/archive`) ? readdirSync(`${src}/archive`).sort() : [];

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const slug = (s) => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');

function page({ title, description, depth, body }) {
  const up = '../'.repeat(depth);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <link rel="icon" href="${up}assets/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${up}assets/style.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="${up}"><img src="${up}assets/logo.svg" alt="">Typed Graph</a>
      <nav class="nav">
        <a href="${up}">Home</a>
        <a href="${up}docs.html">Docs</a>
        <a href="${up}demo.html">Demo</a>
        <a href="${up}example.html">Example</a>
        <a href="${up}blog.html">Blog</a>
        <a href="https://github.com/Volland/typedgraph">GitHub</a>
        <button class="theme-toggle" aria-label="Toggle theme">☾</button>
      </nav>
    </div>
  </header>

  <main class="wrap post">
${body}
  </main>

  <footer>
    <div class="wrap">
      <span>Typed Graph Schema · text CC BY 4.0, JSON Schema and examples MIT · by Volodymyr Pavlyshyn.</span>
      <span><a href="${up}docs.html">Docs</a> · <a href="https://github.com/Volland/typedgraph">GitHub</a> · <a href="${up}impressum.html">Impressum</a> · <a href="${up}datenschutz.html">Datenschutz</a> · <a href="${up}agb.html">AGB</a></span>
    </div>
  </footer>
  <script src="${up}assets/site.js"></script>
</body>
</html>
`;
}

rmSync('site/spec', { recursive: true, force: true });
rmSync('site/ns', { recursive: true, force: true });
const renderer = new marked.Renderer();
renderer.heading = ({ tokens, depth }) => {
  const html = marked.parser([{ type: 'paragraph', tokens, raw: '', text: '' }]).replace(/^<p>|<\/p>\n?$/g, '');
  return `<h${depth} id="${slug(html)}">${html}</h${depth}>\n`;
};

/** Copy one version's files from `from` to `to` and render its page. */
// @tg: implements:: [[openspec:tgs-spec#Published specification]]
function publish(from, to, version, treeUrl) {
  mkdirSync(to, { recursive: true });
  for (const f of ['SPEC.md', 'tgs.schema.json', 'namespace.json']) cpSync(`${from}/${f}`, `${to}/${f}`);
  cpSync(`${from}/examples`, `${to}/examples`, { recursive: true });
  const spec = marked.parse(readFileSync(`${from}/SPEC.md`, 'utf8'), { renderer, gfm: true });
  const files = `<div class="callout">Files: <a href="SPEC.md">SPEC.md</a> · <a href="tgs.schema.json">tgs.schema.json</a> · <a href="namespace.json">namespace.json</a> · <a href="${treeUrl}">conformance examples</a></div>`;
  writeFileSync(
    `${to}/index.html`,
    page({
      title: `Typed Graph Schema (TGS) ${version}`,
      description: 'An open specification for typing markdown knowledge graphs with YAML schema notes that map to and from W3C SHACL.',
      depth: 4,
      body: spec.replace('</h1>\n', `</h1>\n${files}\n`),
    }),
  );
}

publish(src, out, VERSION, 'https://github.com/Volland/typedgraph/tree/main/spec/tgs/examples');
for (const v of archived) publish(`${src}/archive/${v}`, `site/spec/tgs/${v}`, v.replace(/^v/, ''), `https://github.com/Volland/typedgraph/tree/main/spec/tgs/archive/${v}/examples`);

writeFileSync(
  'site/spec/tgs/index.html',
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Typed Graph Schema</title><meta http-equiv="refresh" content="0; url=v${VERSION}/"><link rel="canonical" href="v${VERSION}/"></head><body><a href="v${VERSION}/">Typed Graph Schema ${VERSION}</a></body></html>\n`,
);

const ns = JSON.parse(readFileSync(`${src}/namespace.json`, 'utf8'));
const rows = ns.terms
  .map((t) => `        <tr id="${t.term}"><td><code>tgs:${t.term}</code></td><td>${escape(t.on)}</td><td>${escape(t.range)}</td><td>${escape(t.comment)}</td></tr>`)
  .join('\n');
mkdirSync('site/ns/tgs', { recursive: true });
writeFileSync(
  'site/ns/tgs/index.html',
  page({
    title: 'TGS namespace',
    description: `Terms of the Typed Graph Schema namespace ${ns.namespace}, used as annotations in SHACL exports.`,
    depth: 2,
    body: `    <h1>TGS namespace</h1>
    <p class="standfirst"><code>${escape(ns.namespace)}</code> (prefix <code>${ns.prefix}:</code>) names the annotations a <a href="../../spec/tgs/v${VERSION}/">Typed Graph Schema</a> SHACL export adds for what SHACL cannot express. SHACL engines ignore them.</p>
    <table>
      <thead><tr><th>Term</th><th>On</th><th>Value</th><th>Meaning</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>
    <p>Machine-readable: <a href="../../spec/tgs/v${VERSION}/namespace.json">namespace.json</a>. Defined in section 13.4 of the specification.</p>`,
  }),
);
console.log(`Published TGS ${VERSION} to ${out}/ and site/ns/tgs/`);
