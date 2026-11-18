---
tgs: "0.6"
schemas:
  Member:
    description: "Someone on the team. A section per person, titled with the name people use; its first sentence gives their handle and role."
    visualization: {color: "#e11d48", shape: ellipse}
  Team:
    description: "A group that owns things together and answers for them as one; its first sentence says where to ask it."
    visualization: {color: "#9333ea", shape: round-rectangle}
  TeamAgent:
    description: "A coding agent or automation that does work in this repository on someone's behalf; its first sentence names the product."
    visualization: {color: "#0ea5e9", shape: hexagon}
edgeTypes:
  member_of:
    description: A person belongs to a team.
    from: Member
    to: Team
    properties:
      since: {kind: text, description: Date they joined.}
  owns:
    description: Answers for this decision, requirement, term or code; the first person to ask, and the one who says yes to a change.
    from: [Member, Team]
    to: [Decision, Requirement, Concept, Constraint, CodeFile, CodeSymbol]
    properties:
      since: {kind: text, description: Date ownership started.}
  knows_about:
    description: Can explain this without looking it up. The who-knows-what map, kept beside what it points at.
    from: [Member, TeamAgent]
    to: [Decision, Requirement, Concept, Constraint, CodeFile, CodeSymbol]
    properties:
      depth: {values: [expert, working, aware], description: How far you can rely on them.}
      since: {kind: text, description: Date from which it holds.}
  decided_by:
    description: Who made this decision, and in what role. An agent can propose; only people decide.
    from: Decision
    to: Member
    properties:
      role: {values: [driver, approver, consulted], description: "RACI-style part in the decision."}
      date: {kind: date, description: When they took that part.}
      assisted_by: {kind: text, description: "The agent that helped draft or analyse it, if any. Disclosure as data."}
  proposed_by:
    description: Who first wrote this down, a person or an agent.
    from: [Decision, Requirement, Change]
    to: [Member, TeamAgent]
    properties:
      session: {kind: text, description: A link to the agent session or pull request where it started.}
  acts_for:
    description: An agent works on this person's or team's behalf and inherits their permissions and accountability.
    from: TeamAgent
    to: [Member, Team]
    properties:
      scope: {kind: text, description: "What it may touch, such as a folder or a kind of task."}
      autonomy: {values: [suggest, ask-first, autonomous], description: How far it may act without the person.}
  hands_off_to:
    description: One agent passes work to another, through a document both can read.
    from: TeamAgent
    to: TeamAgent
    properties:
      via: {kind: text, description: The section or spec the work passes through.}
      when: {kind: text, description: The trigger for the hand-off.}
---
The team ontology: who is here, what each person and agent answers for or knows, and who decided what. It builds on the code ontology in `code-types.md` and adds no type that the code ontology or another gallery ontology already declares.

The names are specific on purpose, so the team map composes with other ontologies instead of clashing with them: `Member` rather than `Person`, and `TeamAgent` rather than `Agent`. When a vault also uses OKF's `Person` or the agents ontology's `Agent`, give a note both labels, such as `type: [Person, Member]` or `type: [Agent, TeamAgent]`, and it gets the properties and edges of each.

Write people, teams and agents as sections of `lat.md/people.md`, `teams.md` and `agents.md` with `type: Member`, `Team` or `TeamAgent` in the frontmatter. A section has no properties of its own, so facts go on the edges (`role`, `date`, `assisted_by`, `scope`, `autonomy`) and a person's handle goes in the section's first sentence, which queries return as `summary`. Only a person can be `decided_by`: an agent proposes. The `tg-team` skill tells agents how to use these edges.
