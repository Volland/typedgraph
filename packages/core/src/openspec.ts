export { isSpecTarget, parseSpec, qualifiedGroup, SPEC_SCHEME, SpecIndex } from './openspec/index.js';
export type { SpecFile, SpecRequirement, SpecResolution, SpecScenario } from './openspec/index.js';
export { ADR_DIRS, earsPattern, frameworkOfTarget, locateSpecFile, parseAdr, parseBmad, parseGsd, parseKiro, parseSpecFile, parseSpecKit, SPEC_FRAMEWORKS, specFramework } from './openspec/frameworks.js';
export type { ParsedSpecFile, SpecFrameworkId, SpecFrameworkInfo, SpecLocation } from './openspec/frameworks.js';
export { traceRequirements } from './openspec/trace.js';
export type { RequirementTrace, ScenarioTrace, TraceDoc, TraceLink } from './openspec/trace.js';
