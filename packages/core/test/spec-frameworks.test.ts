import { describe, expect, it } from 'vitest';
import { buildLatGraph, LatIndex, parseKiro, SpecIndex } from '../src/index.js';

const SPECKIT = `# Feature Specification: Auth

**Feature Branch**: \`001-auth\`

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in (Priority: P1)

A returning user signs in with email and password.

**Why this priority**: Nothing works without it.

**Acceptance Scenarios**:

1. **Given** a registered user, **When** they submit valid credentials, **Then** they are signed in
2. **Given** a registered user, **When** they submit a wrong password, **Then** they see an error

---

### Edge Cases

- What happens when the account is locked?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST authenticate users by email and password
- **FR-002**: System MUST lock an account via [NEEDS CLARIFICATION: how many attempts?]

## Success Criteria *(mandatory)*

- **SC-001**: Users sign in within 5 seconds
`;

const KIRO = `# Requirements Document

## Introduction

Export reports.

## Requirements

### Requirement 1

**User Story:** As an analyst, I want to see reports, so that I can decide.

#### Acceptance Criteria

1. WHEN the analyst opens a report THEN the system SHALL render it
2. THE system SHALL cache rendered reports

### Requirement 2: Export

**User Story:** As an analyst, I want to export, so that I can share.

#### Acceptance Criteria

1. WHEN the analyst clicks export THEN the system SHALL download a CSV
2. IF the report is empty, THEN the system SHALL show a message
3. WHILE an export runs the system SHALL show progress
`;

const CCSDD = `# Requirements Document

## Requirements

### Requirement 1: Sign in

**Objective:** As a user, I want to sign in, so that I see my data.

#### Acceptance Criteria

1. When the user submits valid credentials, the Auth Service shall start a session.
`;

const BMAD_PRD = `# Product Requirements

## Requirements

### Functional

#### FR-1: Users can sign in

Users sign in with email.

- NFR1: Pages load in under one second
`;

const BMAD_STORY = `# Story 1.2: Sign in

Status: ready-for-dev

## Story

As a user, I want to sign in, so that I see my data.

## Acceptance Criteria

1. Valid credentials start a session
2. Wrong credentials show an error

## Tasks / Subtasks

- [ ] Task 1 (AC: 1)
`;

const GSD = `# Requirements

## v1 Requirements

### Authentication

- [x] **AUTH-01**: User can sign up with email
- [ ] **AUTH-02**: User can reset a password

## Out of Scope

- [ ] **AUTH-09**: Single sign-on
`;

const MADR = `---
status: accepted
date: 2026-01-02
---
# Use Postgres

## Context and Problem Statement

We need a database.

## Decision Outcome

Chosen option: "Postgres", because it is boring.
`;

const NYGARD_OLD = `# 2. Use Postgres

Date: 2026-01-01

## Status

Superseded by [4. Use SQLite](0004-use-sqlite.md)

## Decision

Postgres.
`;

const NYGARD_NEW = `# 4. Use SQLite

Date: 2026-02-01

## Status

Accepted

Supersedes [2. Use Postgres](0002-use-postgres.md)

## Decision

SQLite is enough.
`;

const OPENSPEC = `## Requirements

### Requirement: Login
Users SHALL log in.

#### Scenario: Valid password
- **WHEN** a valid password is given
- **THEN** a session starts
`;

describe('Spec Kit reader', () => {
  const idx = new SpecIndex([{ path: 'specs/001-auth/spec.md', text: SPECKIT }]);

  // @lat: [[tests/spec-frameworks#Spec Kit reader#Stories, scenarios and requirements]]
  // @tg: verifies:: [[openspec:spec-frameworks#Spec Kit reader#Stories, scenarios and requirements]] {level: unit}
  it('reads user stories with acceptance scenarios and FR and SC items', () => {
    const us = idx.resolve('speckit:001-auth#US1');
    expect(us.kind).toBe('requirement');
    if (us.kind !== 'requirement') return;
    expect(us.requirement.labels).toEqual(['UserStory']);
    expect(us.requirement.props).toMatchObject({ priority: 'P1', title: 'Sign in' });
    expect(us.requirement.text).toBe('A returning user signs in with email and password.');
    expect(us.requirement.scenarios.map((s) => s.name)).toEqual(['Scenario 1', 'Scenario 2']);
    expect(idx.resolve('speckit:001-auth#User Story 1#2').kind).toBe('scenario');
    expect(idx.resolve('speckit:001-auth#Sign in').kind).toBe('requirement');
    const fr = idx.resolve('speckit:001-auth#FR-001');
    expect(fr.kind === 'requirement' && fr.requirement.labels).toEqual(['FunctionalRequirement']);
    const unclear = idx.resolve('speckit:001-auth#FR-002');
    expect(unclear.kind === 'requirement' && unclear.requirement.props?.clarification).toBe('needed');
    const sc = idx.resolve('speckit:001-auth#SC-001');
    expect(sc.kind === 'requirement' && sc.requirement.labels).toEqual(['SuccessCriterion']);
  });

  // @lat: [[tests/spec-frameworks#Spec Kit reader#Short feature name]]
  // @tg: verifies:: [[openspec:spec-frameworks#Spec Kit reader#Short feature name]] {level: unit}
  it('accepts the feature folder name without its number', () => {
    const r = idx.resolve('speckit:auth#FR-001');
    expect(r.kind === 'requirement' && r.requirement.id).toBe('speckit:001-auth#FR-001');
    expect(idx.hasCapability('speckit:auth')).toBe(true);
  });
});

describe('Kiro reader', () => {
  // @lat: [[tests/spec-frameworks#Kiro reader#Criteria numbered as tasks cite them]]
  // @tg: verifies:: [[openspec:spec-frameworks#Kiro reader#Criteria numbered as tasks cite them]] {level: unit}
  it('numbers acceptance criteria N.M with their EARS pattern', () => {
    const idx = new SpecIndex([{ path: '.kiro/specs/reports/requirements.md', text: KIRO }]);
    const c = idx.resolve('kiro:reports#Requirement 2#2.2');
    expect(c.kind).toBe('scenario');
    if (c.kind !== 'scenario') return;
    expect(c.scenario.props).toMatchObject({ ears: 'unwanted' });
    expect(c.scenario.labels).toEqual(['AcceptanceCriterion']);
    expect(idx.resolve('kiro:reports#2#3').kind).toBe('scenario');
    expect(idx.resolve('kiro:reports#Export').kind).toBe('requirement');
    const r1 = idx.resolve('kiro:reports#Requirement 1');
    expect(r1.kind === 'requirement' && r1.requirement.scenarios.map((s) => s.props?.ears)).toEqual(['event-driven', 'ubiquitous']);
    expect(new SpecIndex([{ path: '.spec-workflow/specs/reports/requirements.md', text: KIRO }]).resolve('kiro:reports#Requirement 2#2.3').kind).toBe('scenario');
  });

  // @lat: [[tests/spec-frameworks#Kiro reader#cc-sdd format]]
  // @tg: verifies:: [[openspec:spec-frameworks#Kiro reader#cc-sdd format]] {level: unit}
  it('reads cc-sdd objectives and lowercase EARS criteria', () => {
    const [r] = parseKiro('.kiro/specs/auth/requirements.md', CCSDD, 'auth');
    expect(r!.text).toBe('As a user, I want to sign in, so that I see my data.');
    expect(r!.scenarios[0]!.props?.ears).toBe('event-driven');
  });
});

// @lat: [[tests/spec-frameworks#BMAD reader#PRD and story]]
// @tg: verifies:: [[openspec:spec-frameworks#BMAD reader#PRD and story]] {level: unit}
it('reads BMAD PRD requirements and story acceptance criteria', () => {
  const idx = new SpecIndex([
    { path: '_bmad-output/planning-artifacts/prd.md', text: BMAD_PRD },
    { path: '_bmad-output/implementation-artifacts/1-2-sign-in.md', text: BMAD_STORY },
  ]);
  const fr = idx.resolve('bmad:prd#FR-1');
  expect(fr.kind === 'requirement' && fr.requirement.labels).toEqual(['FunctionalRequirement']);
  const nfr = idx.resolve('bmad:prd#NFR1');
  expect(nfr.kind === 'requirement' && nfr.requirement.labels).toEqual(['NonFunctionalRequirement']);
  const ac = idx.resolve('bmad:epic-1#Story 1.2#AC2');
  expect(ac.kind).toBe('scenario');
  const story = idx.resolve('bmad:epic-1#1.2');
  expect(story.kind === 'requirement' && story.requirement.props?.status).toBe('ready-for-dev');
});

// @lat: [[tests/spec-frameworks#GSD reader#Requirement with category]]
// @tg: verifies:: [[openspec:spec-frameworks#GSD reader#Requirement with category]] {level: unit}
it('reads GSD requirements with category and checkbox, retiring out-of-scope items', () => {
  const idx = new SpecIndex([{ path: '.planning/REQUIREMENTS.md', text: GSD }]);
  const r = idx.resolve('gsd:requirements#AUTH-01');
  expect(r.kind === 'requirement' && r.requirement.props).toMatchObject({ category: 'Authentication', done: 'true' });
  const out = idx.resolve('gsd:requirements#AUTH-09');
  expect(out.kind === 'requirement' && out.requirement.status).toBe('retired');
});

describe('ADR reader', () => {
  // @lat: [[tests/spec-frameworks#ADR reader#MADR record]]
  // @tg: verifies:: [[openspec:spec-frameworks#ADR reader#MADR record]] {level: unit}
  it('reads a MADR record as an active decision', () => {
    const idx = new SpecIndex([{ path: 'docs/decisions/0002-use-postgres.md', text: MADR }]);
    const r = idx.resolve('adr:0002');
    expect(r.kind).toBe('requirement');
    if (r.kind !== 'requirement') return;
    expect(r.requirement.kind).toBe('decision');
    expect(r.requirement.status).toBe('active');
    expect(r.requirement.text).toBe('Chosen option: "Postgres", because it is boring.');
    expect(r.requirement.props).toMatchObject({ title: 'Use Postgres', date: '2026-01-02', adrStatus: 'accepted' });
  });

  // @lat: [[tests/spec-frameworks#ADR reader#Nygard supersession]]
  // @tg: verifies:: [[openspec:spec-frameworks#ADR reader#Nygard supersession]] {level: unit}
  it('turns Supersedes lines into supersedes edges and retires the old record', () => {
    const specs = new SpecIndex([
      { path: 'doc/adr/0002-use-postgres.md', text: NYGARD_OLD },
      { path: 'doc/adr/0004-use-sqlite.md', text: NYGARD_NEW },
    ]);
    const old = specs.resolve('adr:2');
    expect(old.kind === 'requirement' && old.requirement.status).toBe('retired');
    const graph = buildLatGraph(new LatIndex([]), { specs }).graph;
    const out = [...graph.edges()].filter((e) => e.source === 'adr:0004' && e.type === 'supersedes');
    expect(out.map((e) => e.target)).toEqual(['adr:0002']);
    expect(graph.node('adr:0004')!.labels).toEqual(['Decision', 'ADR']);
  });
});

describe('Framework ids', () => {
  const idx = new SpecIndex([
    { path: 'openspec/specs/auth/spec.md', text: OPENSPEC },
    { path: 'docs/adr/0003-use-postgres.md', text: MADR },
    { path: 'specs/001-auth/spec.md', text: SPECKIT },
  ]);

  // @lat: [[tests/spec-frameworks#Framework ids#Alias resolves]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework ids#Alias resolves]] {level: unit}
  it('resolves aliases and keeps schemes apart', () => {
    const r = idx.resolve('adr:3');
    expect(r.kind === 'requirement' && r.requirement.id).toBe('adr:0003');
    expect(idx.resolve('ADR:use-postgres').kind).toBe('requirement');
    expect(idx.resolve('openspec:auth#Login').kind).toBe('requirement');
    expect(idx.resolve('auth#Login').kind).toBe('requirement');
    expect(idx.frameworks()).toEqual(['openspec', 'speckit', 'adr']);
    expect(idx.capabilities()).toEqual(['adr', 'auth', 'speckit:001-auth']);
  });

  // @lat: [[tests/spec-frameworks#Framework ids#Miss with suggestion]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework ids#Miss with suggestion]] {level: unit}
  it('suggests the nearest id on a miss', () => {
    const r = idx.resolve('speckit:001-auth#FR-01');
    expect(r.kind).toBe('missing');
    expect(r.kind === 'missing' && r.suggestion).toBe('speckit:001-auth#FR-001');
    const none = idx.resolve('kiro:x#Requirement 1');
    expect(none.kind === 'missing' && none.message).toContain('no Kiro specs');
  });
});

describe('Framework nodes in the graph', () => {
  // @lat: [[tests/spec-frameworks#Framework nodes in the graph#User story label]]
  // @tg: verifies:: [[openspec:spec-frameworks#Framework nodes in the graph#User story label]] {level: unit}
  it('labels spec nodes with the base type and the framework type, with properties', () => {
    const specs = new SpecIndex([{ path: 'specs/001-auth/spec.md', text: SPECKIT }, { path: '.kiro/specs/reports/requirements.md', text: KIRO }]);
    const graph = buildLatGraph(new LatIndex([]), { specs }).graph;
    const us = graph.node('speckit:001-auth#US1')!;
    expect(us.labels).toEqual(['Requirement', 'UserStory']);
    expect(us.props).toMatchObject({ priority: 'P1', framework: 'speckit', title: 'Sign in', name: 'US1' });
    expect(graph.node('kiro:reports#Requirement 2#2.2')!.labels).toEqual(['Scenario', 'AcceptanceCriterion']);
  });
});
