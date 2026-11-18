---
tgs: "0.1"
schemas:
  Prompt:
    properties:
      purpose: {kind: text, required: true}
      version: text
      status: {values: [draft, tested, production, retired], default: draft}
      model: text
      temperature: number
    edges:
      derived_from: Prompt
      composes: Prompt
      evaluated_by: Eval
    visualization: {color: "#7c5cff", shape: round-rectangle, icon: message-square}
  Agent:
    properties:
      role: {kind: text, required: true}
      model: text
      status: {values: [idea, prototype, production, retired], default: idea}
      autonomy: {values: [suggest, ask-first, autonomous]}
    visualization: {color: "#0ea5e9", shape: hexagon, icon: bot}
  Tool:
    properties:
      kind: {values: [mcp, api, function, cli], default: function}
      side_effects: {values: [none, read, write, destructive], default: none}
    visualization: {color: "#f59e0b", shape: diamond, icon: wrench}
  Skill:
    properties:
      trigger: text
    edges:
      calls_tool: Tool
    visualization: {color: "#14b8a6", shape: round-rectangle, icon: sparkles}
  Knowledge:
    properties:
      kind: {values: [documents, database, web, memory], default: documents}
      freshness: text
    visualization: {color: "#64748b", shape: rectangle, icon: database}
  Eval:
    properties:
      metric: {kind: text, required: true}
      dataset: text
    visualization: {color: "#22c55e", shape: ellipse, icon: gauge}
edgeTypes:
  uses_prompt: {from: Agent, to: Prompt, properties: {slot: {values: [system, developer, user, tool]}}}
  calls_tool: {from: [Agent, Skill], to: Tool, properties: {required: boolean}}
  has_skill: {from: Agent, to: Skill}
  reads: {from: Agent, to: Knowledge}
  delegates_to: {from: Agent, to: Agent, properties: {when: text}}
  composes: {from: Prompt, to: Prompt, properties: {order: number}}
  evaluated_by:
    from: [Prompt, Agent]
    to: Eval
    properties:
      score: number
      date: date
---
The prompt and agent ontology: a gallery of prompts, the agents that use them, the tools and skills those agents call and the knowledge they read, each scored by evals.

`autonomy` says how far an agent may act alone, and a tool's `side_effects` says what a call can break, so a query can find every autonomous agent that can reach a destructive tool.

`derived_from` is declared once in the shared `core` ontology; here each type only says what it may derive from.

`Agent` declares no `edges` list, so other ontologies can build on it: the team ontology's `acts_for` reaches a note labelled `[Agent, TeamAgent]`. Each edge type's `from` and `to` still say where it starts and ends.
