// Render the long-form articles in articles/*.md into flat blog pages in site/.
// The Markdown stays the source; run `npm run site:articles` after editing one.
import { readFileSync, writeFileSync } from 'node:fs';
import { marked } from 'marked';

const POSTS = [
  {
    src: 'articles/typed-graph-for-coders.md',
    out: 'site/blog-typed-graph-for-coders.html',
    title: 'Two Graphs in Your Codebase',
    description: 'A deep dive into typed graphs for developers: what to model, what to leave to the machine, why specs are code now, and a small ontology for intent and code.',
    related: ['blog-code-ontology.html', 'One vocabulary for the whole team: using the code ontology'],
  },
  {
    src: 'articles/code-ontology-in-practice.md',
    out: 'site/blog-code-ontology.html',
    title: 'Using the Code Ontology',
    description: 'One small ontology that tg init installs: how developers, architects, product people and coding agents use it, and how it exports to SHACL.',
    related: ['blog-typed-graph-for-coders.html', 'Your codebase has two graphs. You only maintain one.'],
  },
  {
    src: 'articles/composable-ontologies.md',
    out: 'site/blog-composable-ontologies.html',
    title: 'Composable Ontology Graphs',
    description: 'A gallery of downloadable ontologies as plain Markdown (Zettelkasten, books, requirements, prompts and agents) and the rules for combining them: a shared core, multi-label notes and mixins.',
    related: ['ontologies.html', 'The ontology gallery: download and use'],
  },
];
POSTS.push(
  {
    src: 'articles/shared-space-for-agents-and-humans.md',
    out: 'site/blog-shared-space.html',
    title: 'A Shared Space for Agents and Humans',
    description: 'Why coding agents need the same documented, checked knowledge as the people they work with, and how Typed Graph keeps it in plain Markdown with typed links, a check and agent hooks.',
    date: '7 October 2026',
    related: ['blog-claude-code-memory.html', 'Give Claude Code a memory in five minutes'],
  },
  {
    src: 'articles/claude-code-memory-in-five-minutes.md',
    out: 'site/blog-claude-code-memory.html',
    title: 'Give Claude Code a Memory in Five Minutes',
    description: 'Install the tg CLI, let tg init wire up Claude Code, write a first typed link, and see what the agent gets: search first, a graph to query and a check it cannot skip.',
    date: '7 October 2026',
    related: ['agents.html', 'Typed Graph for agents'],
  },
  {
    src: 'articles/zettelkasten-thinking-machine.md',
    out: 'site/blog-zettelkasten-thinking-machine.html',
    title: 'A Slip Box That Answers Back',
    description: 'Build a Zettelkasten as a typed graph, connect it to the books and articles you read, compose it with a library ontology, and ask it questions a folder of notes cannot answer.',
    date: '8 October 2026',
    related: ['blog-composable-ontologies.html', 'Ontologies you can download, and combine'],
  },
  {
    src: 'articles/specs-that-know-their-code.md',
    out: 'site/blog-specs-that-know-their-code.html',
    title: 'Specs That Know Where Their Code Is',
    description: 'Tracing OpenSpec requirements to the code that implements them, the tests that prove them and the docs that explain them, and what an honest audit of 212 requirements found on the way.',
    date: '8 October 2026',
    related: ['blog-typed-graph-for-coders.html', 'Two graphs in your codebase'],
  },
  {
    src: 'articles/bring-your-own-spec-framework.md',
    out: 'site/blog-spec-frameworks.html',
    title: 'Bring Your Own Spec Framework',
    description: 'tg now traces Spec Kit, Kiro-style specs, BMAD, Get Shit Done and architecture decision records to code, tests and docs, next to OpenSpec, and tg init picks and installs the framework for you.',
    date: '27 October 2026',
    related: ['spec-frameworks.html', 'Supported spec frameworks, and how to add yours'],
  },
  {
    src: 'articles/one-file-or-a-graph.md',
    out: 'site/blog-one-file-or-a-graph.html',
    title: 'One Big File or a Graph?',
    description: 'What about sixty papers, benchmarks and vendor reports say about agent context: one monolithic Markdown or XML file, or small typed files fetched on demand, and the layered design the evidence points to.',
    date: '9 November 2026',
    related: ['blog-shared-space.html', 'A shared space for agents and humans'],
  },
  {
    src: 'articles/explainable-blocks.md',
    out: 'site/blog-explainable-blocks.html',
    title: 'Explainable Blocks',
    description: 'Typed Graph 0.26 lets a type declare and explain the XML blocks inside its sections. Blocks with an id become graph nodes that code can point at, the rest stays prose, and tg checks both.',
    date: '11 November 2026',
    related: ['blog-declaring-elements.html', 'Declaring document elements: one shape, one reading'],
  },
  {
    src: 'articles/declaring-document-elements.md',
    out: 'site/blog-declaring-elements.html',
    title: 'Declaring Document Elements',
    description: 'TGS 0.5 fixes how a type declares the XML blocks inside its documents: YAML declares, XML occurs, attributes have four keys and a reserved id, nested tags have a scope, and every shorthand has one normal form.',
    date: '11 November 2026',
    related: ['blog-explainable-blocks.html', 'Explainable blocks: an ontology for the inside of your documents'],
  },
);
const LINKS = { 'shared-space-for-agents-and-humans.md': 'blog-shared-space.html', 'claude-code-memory-in-five-minutes.md': 'blog-claude-code-memory.html', 'typed-graph-for-coders.md': 'blog-typed-graph-for-coders.html', 'code-ontology-in-practice.md': 'blog-code-ontology.html', 'composable-ontologies.md': 'blog-composable-ontologies.html', 'zettelkasten-thinking-machine.md': 'blog-zettelkasten-thinking-machine.html', 'specs-that-know-their-code.md': 'blog-specs-that-know-their-code.html', 'bring-your-own-spec-framework.md': 'blog-spec-frameworks.html', 'one-file-or-a-graph.md': 'blog-one-file-or-a-graph.html', 'explainable-blocks.md': 'blog-explainable-blocks.html', 'declaring-document-elements.md': 'blog-declaring-elements.html' };
const DATE = '6 October 2026';

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

marked.use({
  renderer: {
    code: ({ text }) => `<pre>${escape(text)}</pre>\n`,
    link({ href, tokens }) {
      return `<a href="${escape(LINKS[href] ?? href)}">${this.parser.parseInline(tokens)}</a>`;
    },
  },
});

for (const p of POSTS) {
  const lines = readFileSync(p.src, 'utf8').split('\n');
  const heading = lines.shift().replace(/^# /, '');
  const rest = lines.join('\n').trim();
  const sub = /^\*(.+?)\*\n/.exec(rest);
  const body = rest.slice(sub ? sub[0].length : 0).replace(/^\s*---\s*\n/, '').replace(/\n---\s*\n(?=\*[^\n]+\*\s*$)/, '\n');
  // Code samples hold @tg: examples; keep tg check from reading this page as annotations.
  const html = marked.parse(body).replace(/@(tg|lat):/g, '@<span></span>$1:').trimEnd().replace(/<p><em>([^]*)<\/em><\/p>$/, '<p class="note"><em>$1</em></p>');
  const [relHref, relTitle] = p.related;
  writeFileSync(
    p.out,
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(p.title)}</title>
  <meta name="description" content="${escape(p.description)}">
  <meta property="og:title" content="${escape(heading)}">
  <meta property="og:description" content="${escape(p.description)}">
  <meta property="og:image" content="https://typedgraph.org/assets/og.png">
  <meta property="og:type" content="article">
  <link rel="icon" href="assets/logo.svg" type="image/svg+xml">
  <link rel="stylesheet" href="assets/style.css">
</head>
<body>
  <header class="site-header">
    <div class="wrap">
      <a class="brand" href="./"><img src="assets/logo.svg" alt="">Typed Graph</a>
      <nav class="nav">
        <a href="./">Home</a>
        <a href="agents.html">Agents</a>
        <a href="obsidian.html">Obsidian</a>
        <a href="teams.html">Teams</a>
        <a href="docs.html">Docs</a>
        <a href="demo.html">Demo</a>
        <a href="example.html">Example</a>
        <a href="ontologies.html">Ontologies</a>
        <a href="blog.html" class="active">Blog</a>
        <a href="https://github.com/Volland/typedgraph">GitHub</a>
        <button class="theme-toggle" aria-label="Toggle theme">☾</button>
      </nav>
    </div>
  </header>

  <main class="wrap post">
    <div class="meta"><a href="blog.html">Blog</a> · ${p.date ?? DATE} · Volodymyr Pavlyshyn</div>
    <h1>${escape(heading)}</h1>
${sub ? `    <p class="standfirst">${marked.parseInline(sub[1])}</p>\n` : ''}
${html}

    <div class="next">Related: <a href="${relHref}">${escape(relTitle)} →</a></div>
  </main>

  <footer>
    <div class="wrap">
      <span>Typed Graph · MIT · by Volodymyr Pavlyshyn. Not affiliated with Obsidian, LadybugDB or lat.md.</span>
      <span><a href="docs.html">Docs</a> · <a href="blog.html">Blog</a> · <a href="https://github.com/Volland/typedgraph">GitHub</a> · <a href="impressum.html">Impressum</a> · <a href="datenschutz.html">Datenschutz</a> · <a href="agb.html">AGB</a></span>
    </div>
  </footer>
  <script src="assets/site.js"></script>
</body>
</html>
`,
  );
}
