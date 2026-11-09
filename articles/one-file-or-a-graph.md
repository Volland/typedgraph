# One big file or a graph of small ones?

*What about sixty papers, benchmarks and vendor reports say about feeding context to agents: one monolithic Markdown or XML file, or many small typed files fetched on demand. Where each one wins, and the layered design the evidence points to.*

---

## The question

Every team that works with coding agents ends up writing context for them. It usually starts as one file: a `CLAUDE.md`, an `AGENTS.md`, a `.cursorrules`. It grows by small additions. Someone adds the architecture, then the test commands, then the reason the auth module looks the way it does. A few months later it is a long document that every session loads in full.

The other end of the spectrum is older than agents. Tools such as Repomix pack a whole repository into one file, XML by default, so it can be pasted into a model. The `llms.txt` proposal has an `llms-full.txt` variant that puts a whole documentation site in one Markdown file. Context windows have reached a million tokens and more. So why not give the model everything and let attention sort it out?

The alternative is the one this site argues for. Knowledge lives in many small files. Each section holds one idea, and typed links say how the ideas relate: this decision `supersedes` that one, this constraint `constrains` that module, this function `implements` that requirement. An agent loads a small core every time and pulls the rest when it needs it.

We build Typed Graph, so we have a stake in the answer. That is the reason for this article. Before telling people to split their context into a graph, we wanted to know what the research says, including the parts that cut against us. We read about sixty sources: peer-reviewed papers, 2026 preprints on agent context files, benchmarks of graph retrieval and agent memory, and the prompting guides of Anthropic, OpenAI and Google. We checked every number below against its source. Where a finding is from a vendor blog or a small study, we say so.

The short version: neither extreme wins. The evidence points to a layered design: a small, stable, always-loaded core, a graph of small typed sections behind it, retrieval that is pushed to the agent rather than left to its initiative, and checks instead of prose for the rules that matter. The rest of this article is the case for that, finding by finding.

## Finding 1: length is a cost in itself

The first argument for a monolith is that modern models can read it. They can, in the sense that it fits. Whether they use it well is a different question, and it has been measured many times.

**Lost in the Middle** (Liu et al., TACL 2024) found the now-famous U-shape: models use information best at the start and end of the context. With twenty retrieved documents, about four thousand tokens, GPT-3.5-Turbo did *worse* with the answer in the middle than with no documents at all.

That was 2023 models. Newer models have fixed some of it. Chroma's **Context Rot** report (2025) tested eighteen models, including GPT-4.1, Claude 4, Gemini 2.5 and Qwen3, and found no notable effect of where the needle sat. What it did find is worse for the monolith: performance falls as input grows, even on simple tasks. One distractor hurts, four hurt more. On LongMemEval, a focused prompt of about 300 tokens beat the full prompt of about 113,000 tokens for every model tested.

The benchmarks that look past literal matching agree. **RULER** (Hsieh et al., COLM 2024) tested seventeen models that score almost perfectly on the plain needle-in-a-haystack test. Only half of them held up at 32K tokens. **NoLiMa** (Modarressi et al., ICML 2025) removed the word overlap between question and needle, so the model has to make an association instead of finding a match. At 32K tokens, eleven of thirteen models fell below half of their short-context score. GPT-4o dropped from 99.3% to 69.7%.

Length hurts even when there is nothing to distract. **Same Task, More Tokens** (Levy, Jacoby and Goldberg, ACL 2024) padded reasoning tasks and saw average accuracy fall from 0.92 to 0.68 by around 3,000 tokens, far below any context limit. **Context Length Alone Hurts LLM Performance Despite Perfect Retrieval** (Du et al., Findings of EMNLP 2025) went further. They gave five models perfect retrieval and replaced the filler with whitespace, or masked it entirely. Performance still dropped by 13.9% to 85% as the input grew. And when the extra material *is* plausible but irrelevant, models are easily led astray (Shi et al., ICML 2023).

The counter-evidence is real and worth stating. Gemini 1.5's technical report shows more than 99% recall up to ten million tokens. That is a single-needle test, the kind RULER and NoLiMa show to be the easy case. The lesson is not that long context is broken. It is that every token you add is a small tax on everything else, and the tax is larger when the task needs reasoning across the context rather than lookup.

Anthropic's own guidance puts it plainly. Its engineering post on context engineering (September 2025) describes an *attention budget* and sets the goal as "the smallest possible set of high-signal tokens".

## Finding 2: rules files have an instruction budget

A context file is not only knowledge. It is mostly instructions: use `uv`, never touch the generated folder, run the linter before committing. Instructions have their own limits.

**How Many Instructions Can LLMs Follow at Once?** (Jaroslawicz et al., 2025) gave twenty models up to five hundred simultaneous instructions. The best frontier models reached 68% accuracy at the highest density, and models favoured the instructions that came first.

The most direct study is a 2026 preprint by McMillan, **Instruction Adherence in Coding Agent Configuration Files**. It ran 1,650 Claude Code sessions and varied the file's size from 25 to 500 lines, the position of instructions, and whether the configuration was one file or several. The results surprise both camps:

| Variable | Result |
|---|---|
| File size, 25 to 500 lines | 60.0%, 65.2%, 67.7%, 64.0% compliance; not significant |
| One `CLAUDE.md` vs split into several always-loaded files | 67.7% vs 61.7% for the nested variant; not significant |
| Position in the session | odds of compliance fell about 5.6% per generated function |

Splitting an always-loaded file into many always-loaded files did nothing measurable. The authors say so directly: their null result "does not support distributing the configuration across multiple files as a remediation". The largest effect was time. Compliance decays as a session goes on, whatever the file looks like. Their recommendation is to move rules that matter into hooks, linters and CI.

Two things follow. First, if a graph helps, it cannot be because it is *many files*. It can only be because the agent loads *less*, and loads the right part. McMillan did not test on-demand retrieval, so the question stays open. Second, the rules you cannot afford to have ignored should not be prose at all. They should be checks.

Claude Code's documentation arrives at the same place from practice: it asks for a `CLAUDE.md` of under 200 lines, because "longer files consume more context and reduce adherence". Its `@path` imports help organise a long file "but don't reduce its context cost".

## Finding 3: what the AGENTS.md studies actually found

2026 brought the first controlled studies of repository context files, and the headline is sobering for everyone who writes them.

**Evaluating AGENTS.md** (Gloaguen, Mündler, Müller, Raychev and Vechev, ETH Zurich) ran Claude Code, Codex and Qwen Code on SWE-bench Lite and on a benchmark of real repositories with developer-written context files. Context files "do not generally improve task success rates" and raise inference cost by over 20%. Files written by an LLM changed the resolve rate by −0.5 and −2 points; files written by developers added +2.4. None of these differences was significant, although human files beat generated ones in a direct comparison. Agents did obey the files: when a file mentioned `uv`, they used it. But repository overviews did not get them to the relevant files any faster. When the authors removed all other documentation, generated files *helped*, which suggests the files mostly repeat the README.

Two other studies point in different directions. Lulla et al. (2026) looked at 124 pull requests and found that an `AGENTS.md` came with a 28.64% lower median runtime and 16.58% fewer output tokens, at similar completion. Khatri (2026) ran 288 sessions with Claude Code and Codex and found that context strategy "does not measurably change correctness". The failures came from implementation skill, not missing knowledge of the repository.

Studies of what people put in these files explain part of it. Across 2,303 context files from 1,925 repositories, Chatlatanagulchai et al. found that they grow through "frequent, small additions" and become hard to read. Three quarters specify testing, but only about one in seven says anything about security or performance. A PostHog essay from August 2026 turns this into a rule of thumb: if you cannot name the failure a line prevents, delete it. They found one stale line that misled agents for twenty-one hours.

Then there is the result most often quoted *for* the monolith. Vercel's evals on Next.js 16 (January 2026) compared an always-loaded `AGENTS.md` against an on-demand skill:

| Setup | Pass rate |
|---|---|
| No docs | 53% |
| Skill, default | 53% |
| Skill with explicit instructions to use it | 79% |
| Docs index in `AGENTS.md` | 100% |

In 56% of cases the skill was never invoked. The agent did not know it needed what it did not have. That is the strongest argument against pure on-demand retrieval in this whole review. Read the details, though. What won was not the documentation pasted into one file. It was an 8KB *index of pointers* to the documentation files, compressed from 40KB with no loss. The agent always saw the map and fetched the territory. That is not a monolith. It is the first layer of a graph.

The honest summary of this finding: always-loaded context files give small, mostly non-significant gains at a measurable cost. What is in them matters far more than how big they are. Human-written, non-redundant content beats generated content. And an always-on index that tells the agent *where* things are beats both a wall of text and a retrieval tool the agent forgets to call.

## Finding 4: XML, Markdown, JSON — format matters, but not the way people argue

The format debate is loud. The evidence is mixed, model-specific, and smaller in effect than the evidence on size and relevance.

Format can matter a lot for a given model. **FormatSpread** (Sclar et al., ICLR 2024) found that meaning-preserving changes to prompt formatting swing few-shot accuracy by up to 76 points on LLaMA-2-13B. **Does Prompt Formatting Have Any Impact on LLM Performance?** (He et al., 2024) compared plain text, Markdown, JSON and YAML. GPT-3.5 varied by up to 40% on one task. GPT-4 was more robust, yet GPT-4-32k on HumanEval still scored 76.2 with plain text and 21.95 with JSON. Format preferences barely carried over between model families.

When the data itself is structured, rankings flip with the shape of the data. **Table Meets LLM** (Sui et al., WSDM 2024) found that markup helps on structural tasks, but XML won one task and Markdown another. Two blog-grade tests by ImprovingAgents (2025) make the point sharply. On deeply nested configuration data, XML came *last* for GPT-5 Nano and Gemini 2.5 Flash Lite, and cost about 80–90% more tokens than Markdown. On flat tables, XML came *second* of eleven formats, behind a Markdown key-value layout. Both tests used small models and were tuned to land in a mid-range accuracy band, so treat them as hints.

The vendors agree more than the folklore suggests:

- **Anthropic** recommends XML tags to separate parts of a prompt, and wrapping each long document in `<document>` with its source. Put long documents at the top and the question at the end; this "can improve response quality by up to 30 percent", especially with many documents.
- **OpenAI**'s GPT-4.1 guide recommends Markdown as the starting point. For large document sets, "XML performed well in our long context testing", a simple `ID: | TITLE: | CONTENT:` layout also did well, and "JSON performed particularly poorly". It suggests placing instructions both before and after long context.
- **Google**'s Gemini guide says XML-style tags or Markdown headings both work, and asks you to choose one and use it consistently. Context first, the question at the end.

So the practical rule is short. Write Markdown: it is what people read and edit, and it is the cheapest in tokens. Use tags at the boundaries when you put several documents into one prompt, with an id on each so the model can cite it. Do not use JSON for prose. Be consistent. And remember the scale: format effects are a few points on strong models, while the size and relevance effects in Finding 1 are tens of points.

For this repository, wrapping each of the 994 sections of our `lat.md/` folder in a `<section>` element that carries its id adds 36% to the character count. That is a cost worth paying at the boundary of a prompt, around a handful of retrieved sections. It is not a format worth storing a knowledge base in.

## Finding 5: long context against retrieval is a fair fight

If length is a tax, retrieval is the obvious way to pay less. But the comparison is closer than retrieval advocates like to admit.

**Retrieval Augmented Generation or Long-Context LLMs?** (Li et al., EMNLP 2024) found that "when resourced sufficiently, LC consistently outperforms RAG" on average. RAG is far cheaper, and their Self-Route method, which lets the model choose per query, keeps long-context quality at a fraction of the cost. Google's **LOFT** benchmark (Lee et al., 2024) found long-context models can rival dedicated retrieval systems, but struggle with compositional, SQL-like reasoning.

On the other side, **Retrieval meets Long Context LLMs** (Xu et al., ICLR 2024) found that retrieval *plus* a long window beat the long window alone. **OP-RAG** (Yu et al., 2024) scored 47.25 F1 with 48K tokens of retrieved chunks where the full 117K-token context scored 34.26. And **Long-Context LLMs Meet RAG** (Jin et al., ICLR 2025) explains why both camps are partly right. Quality rises as you retrieve more passages, then falls. The cause is "hard negatives": passages that look relevant and are not. Stronger retrievers produce more convincing hard negatives.

Granularity matters for retrieval as much as for reading. **Dense X Retrieval** (Chen et al., EMNLP 2024) indexed propositions, one fact each, instead of passages, and raised Recall@20 by 10.1 points for unsupervised retrievers. Chroma's chunking study (2024) found that 200-token chunks matched 800-token chunks on recall while raising precision from 1.4% to 7.0%. Small units are easier to find exactly.

Put together: retrieval wins on cost and on precision, and loses when it misses. Long context wins when you can afford it and the task needs breadth. The best results come from retrieving a *small, precise* set and reading it well.

## Finding 6: graphs help with relations, not with lookups

This is where a typed graph has to earn its keep, and the evidence is the most mixed of all.

Graph-based retrieval has real wins. Microsoft's **GraphRAG** (Edge et al., 2024) beat vector RAG on "global" questions over a million-token corpus, with comprehensiveness win rates of 72–83%. **HippoRAG** (Gutiérrez et al., NeurIPS 2024) improved multi-hop QA by up to 20% while being 10–30 times cheaper than iterative retrieval. **A-MEM** (Xu et al., NeurIPS 2025), an agent memory of Zettelkasten-style atomic notes with links, shows what the links are worth: removing them dropped its multi-hop score from 27.02 to 9.65.

The losses are just as real, and they cluster around simple lookups and cost:

- HippoRAG 2 (ICML 2025) says in its abstract that structure-augmented RAG "performs worse on basic factual memory". In its own tables a strong dense retriever beats GraphRAG, RAPTOR and LightRAG on average.
- **RAG vs. GraphRAG** (Han et al., 2025) found the two complementary. GraphRAG won temporal questions, RAG won unanswerable ones, and each answered queries the other could not. Building the graph took 40–57 times longer than building the vector index. Only about 66% of answer entities made it into the extracted graph at all.
- **GraphRAG-Bench** (Xiang et al., 2025) says GraphRAG "frequently underperforms vanilla RAG on many real-world tasks". It wins complex reasoning and summarisation, but loses fact retrieval, and some variants spend 100,000–331,000 tokens per query against 879 for plain RAG.
- **StructRAG** (Li et al., ICLR 2025), which is a pro-structure paper, found that forcing a graph onto every task scored 22.71 where plain chunks scored 53.92. Structure has to match the question.

Agent memory tells the same story. In Mem0's own paper, full context scored highest on LoCoMo. Letta found that an agent with nothing but `grep` and file tools over raw history scored 74.0%, ahead of the best graph memory. An independent 2026 testbed (Wolff and Bennati) measured Graphiti and cognee at 55–56% where mem0, RAG and full context reached 77–81%. Most of these numbers come from vendors measuring each other, and LoCoMo's methodology is disputed, but the direction is consistent.

In code, graphs help most where the question is relational. **RepoGraph** (ICLR 2025) added about two points to SWE-bench Lite. **CodexGraph** (NAACL 2025), whose agent queries a typed code graph, matched a strong baseline rather than beating it. **LocAgent** (ACL 2025), which navigates a graph of files, classes and functions with import, invoke and inherit edges, reached 92.7% file-level localisation, the strongest code result in this group.

There is a distinction running through all of this that the benchmarks rarely name. Almost every graph that loses is **extracted**: an LLM reads a corpus and guesses the entities and relations. That is slow, expensive and lossy, and the losses show up as missed answers. The graphs that do well on precise questions are **authored**: built from an AST, or written deliberately against a fixed schema.

Two small 2026 studies speak to that directly, and we report them with their limits. **Ontology-Grounded Project Memory for Coding Agents** (Adam, NeSy 2026) stored 835 typed records of decisions, constraints and rationales, linked by supersession. On questions such as "what replaced this decision", "list all of them" and "which ones do *not* apply", it scored 0.98–1.00, against 6–27% for top-k retrieval from a vector memory. Relevance recall and token cost were about the same. The author built the system and the benchmark. **Does Your Agent's Memory Survive a Model Upgrade?** (Goyal and Ray, 2026) found that a fixed-schema knowledge graph gave the same answers after the model behind it was swapped, while free-form model-written notes moved by +9.91 or −13.28 points. That study is small: 48 synthetic histories and models under 10B parameters.

And one more, which matters for anyone hoping agents will organise their own memory: **StructMemEval** (Shutova et al., 2026) found that agents solve ledger, list and tree tasks reliably when they are told how to structure memory, but do not recognise the needed structure on their own. A declared schema is that telling.

The honest summary: **no controlled study isolates typed edges against untyped ones.** What the evidence supports is narrower. Graph structure pays off for multi-hop, temporal, "what changed" and "what is missing" questions. It loses or ties on single-fact lookups, where lexical or vector search over small units is the right tool. Extracted graphs carry a heavy construction cost and miss things. Authored graphs with a fixed schema avoid most of that, and the early evidence says they make answers more complete and more stable.

## Finding 7: where the monolith wins

An article that only lists the monolith's failures would be advertising. There are five situations where one file is the right answer or part of it.

**Caching.** Agents read far more than they write; Manus reports about a hundred input tokens per output token, and calls the KV-cache hit rate "the single most important metric". Cached input is roughly ten times cheaper on Anthropic's API, and a cache hit needs an identical prefix. A stable always-loaded file is the cheapest context there is. Anything spliced into the system prompt per task breaks the cache for everything after it.

**No retrieval miss.** Vercel's 56% is the number to remember. Context the agent does not know it needs will not be fetched.

**Small projects.** If everything you would write fits in a couple of thousand tokens, a graph is overhead. Our [deep dive for developers](blog-typed-graph-for-coders.html) says the same thing: write five typed links, and if they tell you nothing new, stop.

**Breadth tasks with budget.** When the model must consider everything (summarise the whole design, find every place a term appears), long context beats retrieval, as Li et al. and Mem0's own full-context baseline show.

**Do not over-compress.** **Agentic Context Engineering** (Zhang et al., ICLR 2026) found that repeatedly rewriting a context into a summary collapsed an 18,282-token playbook to 122 tokens and dropped accuracy from 66.7 to 57.1, below having no playbook at all. They call it *brevity bias*. Their fix is itemised, incremental updates rather than rewrites. That is an argument for small addressable units edited in place, and against an aggressive "keep it short" rule.

The one detailed account of a large real system follows the same shape. **Codified Context** (Vasilopoulos, 2026) describes a 108,000-line C# codebase built over 283 agent sessions. It ran on a "constitution" of about 660 lines loaded every session, plus 34 specification documents fetched on demand through a keyword-matching server: 1,478 retrieval calls, no embeddings. Its main failure mode was stale specs, and keeping them current took one to two hours a week. Karpathy's *LLM Wiki* pattern (April 2026), an interlinked Markdown wiki with an index, a log and a lint step, has the same parts.

## Our own numbers

We measured what the two extremes would cost on this repository's own design docs, the `lat.md/` folder that Typed Graph is built from.

| | Size |
|---|---|
| Files of intent | 65 |
| Sections | 994 |
| Total | 276,017 characters, about 69,000 tokens |
| Median section | 147 characters |
| 90th percentile section | 610 characters |
| Always-loaded `CLAUDE.md` | 134 lines, about 2,000 tokens |
| One `tg search` plus one `tg section` | about 3,700 characters, about 900 tokens |
| Same docs wrapped in `<section>` elements with ids | +36% characters |

Token counts use the usual four characters per token, so they are approximate. Loaded whole, the docs would sit at about 69,000 tokens: past the 32K mark where RULER and NoLiMa see most models degrade, and that is before a single line of code is read. A typical lookup brings in about 1.3% of that.

We have not run the experiment that would settle the question for this repository, the same tasks with the monolith and with the graph. Nobody has published it for any repository. So treat this table as a cost estimate, not a quality result.

## The recommendation: a layered context

Here is the design we would give a team starting today. Each layer answers one of the findings above.

**1. A small, stable core, always loaded.** Under 200 lines. Commands, the few conventions that cannot be checked by a tool, and above all a *map*: one line per area of the knowledge base, saying what lives where. Vercel's index and the Codified Context constitution are both this. Keep it stable so it stays cached. Delete any line whose failure you cannot name.

**2. Behind it, a graph of small sections.** One idea per section. Give each a short lead paragraph that can stand alone as its summary; Typed Graph enforces 250 characters. The summary is what search returns and what the agent reads first, which gives progressive disclosure for free: map, then summary, then section, then the code it points to. Small units are what Dense X and the chunking studies say retrieve best.

**3. Type the relations you will ask about.** Do not type everything. Type the edges that answer the questions that graphs are good at and search is bad at: `supersedes` (what replaced this?), `constrains` (what limits this module?), `implements` and `verifies` (what code realises this requirement, what test proves it?), `-contradicts` (what known debt is here?). Declare them in a schema so they mean the same thing to every reader, human or model, and to the next model you switch to. Write them by hand or from the AST; do not extract them with an LLM.

**4. Push retrieval, do not wait for it.** The agent will not fetch what it does not know it lacks. Run a search on every prompt and *append* the top few summaries to the conversation, never splicing them into the system prompt, so the cached prefix survives. Let the agent pull more with search, section reads and graph queries when the pushed context points somewhere.

**5. Use the right retrieval for the question.** Lexical and vector search over small sections for lookups, where they beat graphs. Graph traversal for relational questions, where they lose. Plain `grep` as the baseline everything else must beat.

**6. Mind the format at the boundary.** Markdown in the files. When several sections go into one prompt, wrap each in a tag with its id and source, put them before the question, and keep JSON out of prose.

**7. Turn rules into checks.** Compliance decays within a session and file layout does not fix it. The rules that matter belong in hooks, linters and CI: a check that fails when a link breaks, a section loses its code, or a requirement has no test. Stale context is the failure mode every multi-file system reports; a check is the only thing that catches it on the day it happens.

**8. Measure on your own tasks.** Format preferences do not transfer between model families, and every result above may shift with the next model. Keep a small set of real tasks and run it against the monolith, against `grep`, and against your graph.

Here is the same advice as a table:

| Situation | Choose |
|---|---|
| Everything fits in a few thousand tokens | One file. Stop there. |
| Rules the agent must always follow | A short always-loaded core, plus hooks and CI to enforce them |
| Knowledge that grows past ~10K tokens | Small sections behind an always-loaded map |
| "Where is X?" or "what does X say?" | Lexical or vector search over small sections |
| "What replaced X?", "what does X constrain?", "what is untested?" | Typed edges and a graph query |
| A one-off question over everything | Long context, if you can pay for it |
| Many documents in one prompt | Markdown inside, tags with ids at the boundary, question last |

This is what Typed Graph does, and we built it this way because of evidence like the above, not the other way round. `tg init` writes the short core into `CLAUDE.md` and `AGENTS.md`, keeps the knowledge in typed Markdown sections with a lead-paragraph rule, installs a prompt hook that searches the docs and appends the top matches, and installs a stop hook that will not let the agent finish while `tg check` fails. You do not need Typed Graph to follow the recommendation. You need the layers.

## What the evidence does not show

We would rather end on the gaps than on a claim.

- **No controlled study compares a monolithic context file with a graph of retrieved files** on coding-agent task success. The pieces are measured separately. The whole is not.
- **No study isolates typed edges from untyped links.** The evidence for types is indirect: complete answers on supersession and negation questions, stability across model upgrades, agents doing better when told the structure. All of it comes from small studies.
- **Much of the memory literature is vendors measuring vendors**, on a benchmark whose methodology is disputed.
- **The 2026 context-file studies are early.** Two find no effect on success, one finds efficiency gains, and they disagree on cost.
- **Models change faster than papers.** The lost-in-the-middle effect largely went away in two years. Some of today's limits will too. The cost of tokens and the value of knowing *why* a decision was made will not.

If you run the missing experiment, we would like to read it.

## Sources

### Long context and length

- Liu et al., *Lost in the Middle: How Language Models Use Long Contexts*, TACL 2024. [arXiv:2307.03172](https://arxiv.org/abs/2307.03172)
- Hong, Troynikov and Huber, *Context Rot: How Increasing Input Tokens Impacts LLM Performance*, Chroma, 2025. [trychroma.com/research/context-rot](https://www.trychroma.com/research/context-rot)
- Hsieh et al., *RULER: What's the Real Context Size of Your Long-Context Language Models?*, COLM 2024. [arXiv:2404.06654](https://arxiv.org/abs/2404.06654)
- Modarressi et al., *NoLiMa: Long-Context Evaluation Beyond Literal Matching*, ICML 2025. [arXiv:2502.05167](https://arxiv.org/abs/2502.05167)
- Levy, Jacoby and Goldberg, *Same Task, More Tokens*, ACL 2024. [arXiv:2402.14848](https://arxiv.org/abs/2402.14848)
- Du et al., *Context Length Alone Hurts LLM Performance Despite Perfect Retrieval*, Findings of EMNLP 2025. [arXiv:2510.05381](https://arxiv.org/abs/2510.05381)
- Shi et al., *Large Language Models Can Be Easily Distracted by Irrelevant Context*, ICML 2023. [arXiv:2302.00093](https://arxiv.org/abs/2302.00093)
- Gemini Team, *Gemini 1.5* technical report, 2024. [arXiv:2403.05530](https://arxiv.org/abs/2403.05530)

### Instructions and agent context files

- Jaroslawicz et al., *How Many Instructions Can LLMs Follow at Once?*, 2025. [arXiv:2507.11538](https://arxiv.org/abs/2507.11538)
- McMillan, *Instruction Adherence in Coding Agent Configuration Files*, 2026. [arXiv:2605.10039](https://arxiv.org/abs/2605.10039)
- Gloaguen, Mündler, Müller, Raychev and Vechev, *Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?*, 2026. [arXiv:2602.11988](https://arxiv.org/abs/2602.11988)
- Lulla et al., *On the Impact of AGENTS.md Files on the Efficiency of AI Coding Agents*, 2026. [arXiv:2601.20404](https://arxiv.org/abs/2601.20404)
- Khatri, *Do Context Files Help Coding Agents? A Two-Agent Ablation Study on Real Repositories*, 2026. [arXiv:2607.27250](https://arxiv.org/abs/2607.27250)
- Chatlatanagulchai et al., *Agent READMEs: An Empirical Study of Context Files for Agentic Coding*, 2025. [arXiv:2511.12884](https://arxiv.org/abs/2511.12884)
- Vasilopoulos, *Codified Context: Infrastructure for AI Agents in a Complex Codebase*, 2026. [arXiv:2602.20478](https://arxiv.org/abs/2602.20478)
- Zhang et al., *Agentic Context Engineering*, ICLR 2026. [arXiv:2510.04618](https://arxiv.org/abs/2510.04618)
- Gao, *AGENTS.md outperforms skills in our agent evals*, Vercel, January 2026. [vercel.com/blog](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
- Yoon, *Your AGENTS.md is holding you back*, PostHog, August 2026. [newsletter.posthog.com](https://newsletter.posthog.com/p/your-agentsmd-is-holding-you-back)

### Prompt format

- Sclar et al., *Quantifying Language Models' Sensitivity to Spurious Features in Prompt Design*, ICLR 2024. [arXiv:2310.11324](https://arxiv.org/abs/2310.11324)
- He et al., *Does Prompt Formatting Have Any Impact on LLM Performance?*, 2024. [arXiv:2411.10541](https://arxiv.org/abs/2411.10541)
- Sui et al., *Table Meets LLM*, WSDM 2024. [arXiv:2305.13062](https://arxiv.org/abs/2305.13062)
- Fatemi, Halcrow and Perozzi, *Talk like a Graph: Encoding Graphs for Large Language Models*, ICLR 2024. [arXiv:2310.04560](https://arxiv.org/abs/2310.04560)
- ImprovingAgents, *Which nested data format do LLMs understand best?* and *Which table format do LLMs understand best?*, 2025. [improvingagents.com](https://www.improvingagents.com/blog/best-nested-data-format/)

### Long context against retrieval, and granularity

- Li et al., *Retrieval Augmented Generation or Long-Context LLMs?*, EMNLP 2024. [arXiv:2407.16833](https://arxiv.org/abs/2407.16833)
- Lee et al., *Can Long-Context Language Models Subsume Retrieval, RAG, SQL, and More?* (LOFT), 2024. [arXiv:2406.13121](https://arxiv.org/abs/2406.13121)
- Xu et al., *Retrieval meets Long Context Large Language Models*, ICLR 2024. [arXiv:2310.03025](https://arxiv.org/abs/2310.03025)
- Jin et al., *Long-Context LLMs Meet RAG*, ICLR 2025. [arXiv:2410.05983](https://arxiv.org/abs/2410.05983)
- Yu, Xu and Akkiraju, *In Defense of RAG in the Era of Long-Context Language Models*, 2024. [arXiv:2409.01666](https://arxiv.org/abs/2409.01666)
- Chen et al., *Dense X Retrieval: What Retrieval Granularity Should We Use?*, EMNLP 2024. [arXiv:2312.06648](https://arxiv.org/abs/2312.06648)
- Smith and Troynikov, *Evaluating Chunking Strategies for Retrieval*, Chroma, 2024. [trychroma.com/research/evaluating-chunking](https://www.trychroma.com/research/evaluating-chunking)

### Graphs and memory

- Edge et al., *From Local to Global: A Graph RAG Approach to Query-Focused Summarization*, 2024. [arXiv:2404.16130](https://arxiv.org/abs/2404.16130)
- Gutiérrez et al., *HippoRAG*, NeurIPS 2024. [arXiv:2405.14831](https://arxiv.org/abs/2405.14831)
- Gutiérrez et al., *From RAG to Memory: Non-Parametric Continual Learning for Large Language Models*, ICML 2025. [arXiv:2502.14802](https://arxiv.org/abs/2502.14802)
- Han et al., *RAG vs. GraphRAG: A Systematic Evaluation and Key Insights*, 2025. [arXiv:2502.11371](https://arxiv.org/abs/2502.11371)
- Xiang et al., *When to use Graphs in RAG* (GraphRAG-Bench), 2025. [arXiv:2506.05690](https://arxiv.org/abs/2506.05690)
- Li et al., *StructRAG*, ICLR 2025. [arXiv:2410.08815](https://arxiv.org/abs/2410.08815)
- Xu et al., *A-MEM: Agentic Memory for LLM Agents*, NeurIPS 2025. [arXiv:2502.12110](https://arxiv.org/abs/2502.12110)
- Chhikara et al., *Mem0*, 2025. [arXiv:2504.19413](https://arxiv.org/abs/2504.19413)
- Letta, *Benchmarking AI Agent Memory: Is a Filesystem All You Need?*, 2025. [letta.com/blog](https://www.letta.com/blog/benchmarking-ai-agent-memory)
- Wolff and Bennati, *Cost and Accuracy of Long-Term Memory in Distributed Multi-Agent Systems*, 2026. [arXiv:2601.07978](https://arxiv.org/abs/2601.07978)
- Shutova et al., *Evaluating Memory Structure in LLM Agents*, 2026. [arXiv:2602.11243](https://arxiv.org/abs/2602.11243)
- Goyal and Ray, *Does Your Agent's Memory Survive a Model Upgrade?*, 2026. [arXiv:2609.05339](https://arxiv.org/abs/2609.05339)
- Adam, *Ontology-Grounded Project Memory for Coding Agents*, NeSy 2026. [arXiv:2608.13662](https://arxiv.org/abs/2608.13662)
- Ouyang et al., *RepoGraph*, ICLR 2025. [arXiv:2410.14684](https://arxiv.org/abs/2410.14684)
- Liu et al., *CodexGraph*, NAACL 2025. [arXiv:2408.03910](https://arxiv.org/abs/2408.03910)
- Chen et al., *LocAgent*, ACL 2025. [aclanthology.org/2025.acl-long.426](https://aclanthology.org/2025.acl-long.426)

### Vendor and practitioner guidance

- Anthropic, *Effective context engineering for AI agents*, September 2025. [anthropic.com/engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic, *Equipping agents for the real world with Agent Skills*, October 2025. [anthropic.com/engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- Anthropic, Claude prompting best practices and prompt caching. [platform.claude.com/docs](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)
- Claude Code, *Manage Claude's memory*. [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)
- OpenAI, *GPT-4.1 Prompting Guide*, April 2025. [developers.openai.com/cookbook](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)
- Google, *Gemini prompting strategies*. [aistudio.google.com/docs](https://aistudio.google.com/docs/prompting-strategies)
- Ji, *Context Engineering for AI Agents: Lessons from Building Manus*, July 2025. [manus.im/blog](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus)
- Karpathy, *LLM Wiki*, April 2026. [gist.github.com/karpathy](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)

---

*Typed Graph and the `tg` CLI are open source (MIT). Docs and the other articles are at [typedgraph.org](https://typedgraph.org/). We are not affiliated with any of the authors, vendors or tools cited here. Numbers are as stated in each source on 9 November 2026; benchmarks move with every model release.*
