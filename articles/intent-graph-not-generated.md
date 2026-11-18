# The graph you can generate and the graph you can't

*Graphify maps what your code is. TypeGraph records what it is for. A code graph can be built by a parser in seconds. An intent graph cannot be built by anything, and the research on why is more specific than "models hallucinate". This is the case for owning both, and for knowing which one is which.*

---

## A good tool, and a question it cannot answer

Run `/graphify .` on a repository and, a few minutes later, you have a map. Tree-sitter parses the code locally, with no model call and nothing leaving your machine. Every function, class and import becomes a node. Every call and inheritance link becomes an edge, and each edge says how it was found: `EXTRACTED` when the source states it, `INFERRED` when a resolver worked it out, `AMBIGUOUS` when it could not decide. You get a clickable graph, a report of the god nodes and surprising connections, and a `graph.json` your agent can query instead of grepping.

This is a real improvement, and the numbers are respectable. On graphify's own benchmark, a fixed coding agent answers graded questions about ERPNext, a repository of roughly a million lines. With one code-graph tool added to a grep-and-read floor, it covers 82.0% of the key facts, against 70.8% for grep and read alone. The graph costs zero LLM credits to build. The sample is six questions, so read it as a direction, not a verdict. It points the right way.

Now ask the same repository this:

> Why does the payment service retry three times, and is three a requirement?

The graph can show you the retry loop, its caller and everything it calls. It cannot say whether the number three is a contract, a guess or a scar. That fact is not in the graph because it is not in the code. No better parser changes this, and no larger model does either.

That gap is what this article is about. It has a name, an old literature, some new measurements, and a practical consequence for how you set up a repository that humans and agents share.

If you read [the earlier piece on the two graphs in a codebase](https://volodymyrpavlyshyn.substack.com/p/your-codebase-has-two-graphs-you), you know the shape of the argument: a *structure graph* derived from code, an *intent graph* written by people, and a checker that makes them disagree out loud. We will not repeat that case. This article asks a narrower question that the first one left open: **where exactly does generation stop being possible?** The answer turns out to have three parts, and it changes what you should automate.

---

## Three kinds of knowledge about a program

When people say "knowledge graph of the codebase" they mix three different things. They differ in where the knowledge comes from, and therefore in what a machine can do with them.

**1. Structure** answers: what is connected to what?

- It lives in the source text.
- A tool can derive it, deterministically.
- Example: `verifyToken` is called by 14 functions.
- When it is wrong: an edge is missing.

**2. Behavior** answers: what does it do when it runs?

- It lives in the running system: tests, traces, logs.
- A tool can observe it, but must not invent it.
- Example: `verifyToken` accepts a 90-day-old token.
- When it is wrong: you find a surprising bug.

**3. Intent** answers: what is it supposed to do, and why?

- It lives in people's decisions.
- No tool can derive it.
- Example: tokens must expire after 15 minutes.
- When it is wrong: everything is faithfully consistent, and wrong.

The three get harder to automate in that order, and the cost of an error moves the same way. A parser that misses a dynamic call produces a hole in the map. You notice it the first time you look. A tool that writes down "tokens are accepted for 90 days" as though it were a requirement produces something worse: a clean, plausible, wrong sentence that now sits in your docs with the authority of documentation.

Graphify lives in the first column, and it knows it. Its own materials say that static extraction cannot see dynamic dispatch, reflection or configuration-driven wiring, and the `EXTRACTED`, `INFERRED` and `AMBIGUOUS` tags exist so that you can tell what was read from what was guessed. That is an honest design for the problem it solves. Notice what the tags measure, though, because the difference matters for everything that follows.

---

## Confidence is not commitment

An edge tag in a code graph answers: *how sure are we that this relationship exists in the program?* That is an **epistemic** question about observation. A call is either in the code or it is not, and the parser is more or less certain of it.

An edge in an intent graph answers a different question: *who stands behind this claim?* `implements::`, `motivated_by::`, `supersedes::` and `-contradicts::` are not observations. They are **commitments**. Someone decided that this function realizes that requirement, or that this decision replaced the earlier one. The properties on the edge record the facts of the commitment: `since`, `ticket`, `until`, `weight`.

Two consequences follow, and neither is a matter of tooling quality.

**A commitment cannot be inferred, only made.** If you ask a model "does this function implement the expiry rule?", you get a probability that the two look related. That is a useful search result. It is not a statement that anyone is accountable for.

**A contradiction needs two sources.** The whole value of `-contradicts::` is that it marks a place where two independent things disagree: what the team decided, and what the code does. If the second thing is generated from the first, or the first from the second, there is nothing independent left to disagree. You have a mirror, and a mirror always agrees with what stands in front of it.

This is the formal version of an intuition most engineers already have. It also has an empirical face, which is where the interesting research is.

---

## What the research says

### Naur: the theory is not in the text

In 1985 Peter Naur published "Programming as Theory Building". His claim is that a program is not its source text. The program is a *theory* that the team holds: why the problem is shaped this way, how the code maps onto it, what would have to change if the world changed. The text is a residue of that theory. Naur's strong conclusion is that reviving a program from its documentation alone is, in his word, impossible, and that a program dies when the team holding its theory dissolves, even while the code keeps running.

Treat that conclusion with some care. It is a philosophical argument from 1985, and commentators note that it is more nuanced than its slogans. It is also, forty years later, the best available description of the thing an agent lacks when it opens a repository cold. The agent has the residue. It does not have the theory, and a model that summarizes the residue produces a summary of the residue, a better-formatted version of the same missing information.

What an intent graph does, in Naur's terms, is get the parts of the theory that *can* be said out loud into a form that survives the team. It will never hold the whole theory. It does not need to. It needs the load-bearing sentences: this is a rule, this is why, this was rejected.

### Tests generated from code learn the code's bugs

If intent could be recovered from behavior, models that write tests from code would be good at catching bugs. The evidence says they are not. A study of 24 Java repositories (*Do LLMs generate test oracles that capture the actual or the expected program behaviour?*) found that models tend to write oracles that reflect the **actual** behavior of the code. A separate paper on LLM test generators (*Design choices made by LLM-based test generators prevent them from finding bugs*) found that when the input is real, buggy, human-written code, the generated tests can end up validating the bugs instead of revealing them. A 2026 follow-up on a benchmark of 36 real Java bugs scores each oracle by whether it fails on the buggy version and passes on the fixed one, which is the right test for exactly this problem.

This is the circularity from the previous section, measured. A test is a claim about what *should* happen. If the claim is derived from what *does* happen, the test passes by construction and tells you nothing. The same holds one level up for documentation: a doc generated from code is a test oracle written in prose.

Read the limits of this evidence plainly. These are studies of test generation, and the findings are about tendencies, not laws. A blog post that circulates a figure for how much worse bug detection gets on incorrect code could not be traced to a primary source, so we do not repeat it. The direction is consistent across the primary papers: deriving expected behavior from observed behavior inherits the bugs.

### Generated context files do not help, and the reason is the same

The most direct measurement of "just let the model write the repo's guidance" is *Evaluating AGENTS.md* (Gloaguen, Mündler, Müller, Raychev and Vechev, ETH Zurich, arXiv 2602.11988). They ran Claude Code, Codex and Qwen Code on SWE-bench and on a benchmark of real repositories that carry developer-written context files. Across agents, context files tended to lower task success slightly and raised inference cost by more than 20%. Agents did follow the instructions in the files. But repository overviews, the thing everybody generates and model providers recommend, did not get agents to the relevant files any faster. The authors' own conclusion is that human-written files should state only minimal requirements.

The mechanism matters more than the percentages. An overview of a repository is derivable from the repository, so the agent already had it, or could get it for free. The only content that adds something is the content that is not derivable: the build command that is not the obvious one, the constraint that is not visible in the code. That is intent, in small doses. We covered the full set of context-file studies in [One big file or a graph of small ones?](one-file-or-a-graph.md). The point here is narrower. The part of a context file that helps is the part a model could not have generated.

### Rationale lives in human writing, so mine it, do not synthesize it

There is a body of software engineering research on recovering design rationale automatically. It is worth reading precisely, because it is the strongest counter-argument to this article and it turns out to support it.

A 2026 study (Sun et al., arXiv 2604.10345) analyzed the artifacts attached to 63 commits across five widely used Java systems and built an LLM tool, Argus, that extracts and generates rationale for a change from multiple documents. Twelve developers found the summaries useful for review, documentation and debugging. Other work, such as DRMiner, mines design rationale from Jira discussions, and earlier tools recover architecture decisions from issue trackers and code together.

Look at the inputs. Every one of these approaches reads **text people wrote**: issues, pull request discussions, review comments, commit messages. The rationale was recorded by a human at the time and scattered across places. The machine's job is to collect and condense it. None of the studies recover the "why" from source code alone, and a search for one comes back empty.

That draws the line more sharply than "generated versus written":

- **Extract** intent from human writing that already exists. This works, and it is worth automating.
- **Generate** intent from code. This produces a plausible reason with no author behind it.
- **Infer** intent from behavior. This reproduces whatever the program currently does, bugs included.

An intent graph is where the extracted, human-authored rationale ends up in a form that a checker and an agent can use. An agent drafting a decision record from a closed pull request and its review thread is doing extraction. A person reads it and commits to it. That is not the same act as asking a model what the code means.

---

## What goes wrong when you generate it anyway

Put the three kinds of knowledge together and the failure modes are predictable.

**The map becomes the territory.** An agent that trusts a generated description of the codebase treats current behavior as intended behavior. When it modifies the code, it keeps the bug that the description enshrined. This is the quietest failure, because nothing breaks. Every check passes.

**Chesterton's fence disappears.** The three-attempt retry looks arbitrary, so a tidy agent raises it to ten. The reason it was three, a provider's rate limit and an incident from last spring, lives in a Slack thread. A structure graph shows the loop. It does not show the fence post.

**The graph grows without getting smarter.** A graph with an edge per call is as large as the code. Nobody reads it, and an agent loading it into context pays for the volume. The graph worth keeping is small on purpose: a node per decision and an edge per claim someone chose to make. We measured our own: 65 files of intent, 994 sections, a median section of 147 characters. One search plus one section read costs about 900 tokens. The curation is the product.

None of this makes the code graph less useful. It makes it a different tool. A map of roads is not a map of where people intend to go.

---

## So what do you automate?

The division of labor comes out as a rule you can apply to any piece of knowledge in a project:

> **Derive what the code can tell you. Observe what the system does. Write down what only people know. Let a machine check that the three agree.**

In practice:

1. **Derive structure, always.** Use a code graph. Graphify is built for this: local, deterministic, cheap, regenerated on every commit. Let your agent ask it who calls what instead of reading forty files. TypeGraph does the same job internally and keeps the code nodes in memory, never on disk, because anything you can regenerate should not be committed.

2. **Observe behavior, and label it as observation.** Traces, test results and coverage tell you what the system does. Keep them as evidence. Do not promote them to requirements without a person.

3. **Write intent by hand, small.** A decision, a requirement, a constraint, a rejected alternative. Plain Markdown, one file per kind, typed edges:

   ```markdown
   ## Retry on provider timeout

   Payment calls retry three times with backoff, then fail the order.

   - motivated_by:: [[constraints#Provider rate limit]] {since: "2.3", ticket: "PAY-212"}
   - supersedes:: [[decisions#Retry five times]] {reason: "outage of March"}
   ```

4. **Let agents draft, and let people commit.** An agent that just changed a function is well placed to propose the doc update, or to extract a decision from a closed pull request. A person reads the sentence before it lands, because the sentence is a commitment. Hooks can refuse to let an agent finish when it changed a lot of code and touched no docs.

5. **Check the three against each other.** `tg check` fails the build on links that point at nothing. `tg trace --gaps` lists requirements nothing implements and code that implements something nobody wrote down. That is the independent second source. It exists only because one side was written by a human.

---

## Using both in one session

Here is the same agent working on the retry question, with both skills installed.

The agent calls the code graph first. It gets the structure: the retry loop sits in `PaymentClient.charge`, called from three handlers, and nothing else depends on the constant. That answer is fast and certain, and it came from the parser.

Then the agent asks the intent graph:

```bash
tg cypher "MATCH (c:Constraint)<-[r:motivated_by]-(d:Decision {title: 'Retry on provider timeout'}) RETURN c.title, r.ticket"
```

It gets the rate limit, the ticket and the superseded decision. Now it knows that the number is a fence, who built it, and what lifting it would cost. If the person asks it to raise the limit, it can say what it would be violating before it edits anything, and `tg trace` will flag the annotated code if the change makes it diverge from the decision.

The two tools never compete for the same question. One answers **what is connected to what**, and the other answers **what must stay true, and why**. We have not built, and are not claiming, a deep integration between them. They share a place: your agent's skill list. The interesting thing is that they compose without help, because they cover non-overlapping columns of the table above.

---

## What it costs, and where this does not fit

An honest article about hand-written knowledge has to say what hand-writing costs.

- **It takes time.** A decision record is minutes of writing. A repository with two hundred requirements takes real effort to annotate, and our own audit of 239 requirements found stale specs and real bugs on the way, which was the point and also a bill.
- **It rots if nothing checks it.** An intent graph without a checker is documentation, and documentation drifts. The value comes from the build failing when it does.
- **It is small on purpose, so it is incomplete on purpose.** You will not write everything down. You write what must stay true. If you want a graph that covers every call, you want the code graph, and you should use it.
- **It is a young practice.** We have not run the controlled experiment that would show an agent with a typed intent graph beating the same agent without one on the same tasks. Nobody has published that for any repository we know of. What we have is a cost estimate and a list of failure modes with literature behind them. Treat both as reasons to try it, not as proof.
- **It does not fit throwaway code.** A prototype that will be deleted next week has no theory worth saving.

---

## The point

A code graph answers the questions a program can answer about itself. It is fast, honest about its confidence and getting better. Use it everywhere.

An intent graph answers the questions only a team can answer: why, what is required, what was rejected, what must not change. The research agrees on one thing across very different methods. Naur's theory, the oracle studies, the context-file measurements and the rationale-mining work all show that this knowledge is carried by people and recorded in their writing. You can mine it from there, and you can check code against it. You cannot make it up from the code, because the code is the thing the intent was supposed to be independent of.

Build the graph a parser can build. Write the graph only you can write. Then run the check that makes them argue.

---

## Try it

```bash
uv tool install graphifyy && graphify install      # the structure graph
npm i -g @typedgraph/cli && tg init                # the intent graph
```

Then, in your agent, `/graphify .` for the map and `tg search "why"` for the reasons. Start by writing down one decision that currently lives only in someone's head, and see how long it takes before you need it.

## Sources

- Naur, P. (1985). [Programming as Theory Building](https://neonvagabond.xyz/mirrors/naur1985programming.html).
- Gloaguen, Mündler, Müller, Raychev, Vechev (2026). [Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?](https://arxiv.org/abs/2602.11988)
- [Do LLMs generate test oracles that capture the actual or the expected program behaviour?](https://arxiv.org/html/2410.21136v1)
- [Design choices made by LLM-based test generators prevent them from finding bugs](https://arxiv.org/html/2412.14137v1)
- [Understanding LLM-Driven Test Oracle Generation](https://arxiv.org/abs/2601.05542v1)
- Sun et al. (2026). [Fine-grained Multi-Document Extraction and Generation of Code Change Rationale](https://arxiv.org/pdf/2604.10345).
- [DRMiner: Extracting Latent Design Rationale from Jira Issue Logs](https://bohrium.dp.tech/paper/arxiv/2209.00398).
- [Graphify](https://graphify.com/what-is-graphify) and its repository benchmarks (`BENCHMARKS.md`, ERPNext cross-tool suite, last updated 2026-07-05).
