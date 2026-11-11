---
status: proposed
date: YYYY-MM-DD
decision-makers: []
---
# {short title of the decision}

## Context and Problem Statement

{Describe the context and the problem in two or three sentences.}

## Considered Options

<option id="{option-1}" outcome="chosen">

{option 1}: {why it won}

</option>

<option id="{option-2}" outcome="rejected">

{option 2}: {why it lost}

</option>

## Decision Outcome

Chosen option: "{option 1}", because {justification}.

### Consequences

<consequence kind="good">

{positive consequence}

</consequence>

<consequence kind="bad">

{negative consequence}

</consequence>

## More Information

Link code that realizes this decision with `// @tg: implements:: [[adr:NNNN]]`, or one of its options with `[[adr:NNNN#^option-id]]`, and earlier records it replaces with a line `Supersedes [NNNN. Title](NNNN-title.md)`. `tg ontology` says what each heading and element is for.
