import type { YamlParser } from '../asciidoc/meta.js';
import type { Diagnostic } from '../edges/parse.js';
import { EmbedIndex } from '../embeds/embeds.js';
import { Graph, type NoteInput } from '../graph/graph.js';
import { pathResolver } from '../graph/resolve.js';
import { DEFAULT_SCHEMA_FOLDER, isSchemaPath, readSchemaNote, schemaSetFromNotes, schemasFromGraph, validateSchemas, type SchemaSet } from '../schema/schema.js';
import { styleSourcesFromSchemas, type IconCheck } from '../style/style.js';
import { noteDocumentDiagnostics } from '../elements/validate.js';

export type Severity = 'error' | 'warning';

/** A diagnostic with a stable code, a severity and a 1-based line, for `tg validate` and CI. */
export interface VaultFinding {
  code: string;
  severity: Severity;
  /** Vault-relative note path, or null for a finding about plugin settings. */
  path: string | null;
  /** 1-based line, or null for a note-level finding. */
  line: number | null;
  message: string;
}

/** Declaration problems make the schema unusable; everything else is advisory. */
const ERROR_CODES = new Set(['invalid-declaration', 'unsupported-version', 'duplicate-declaration']);

/** Codes whose line always points into the note body, even line 0. */
const LINE_CODES = new Set(['edge-syntax', 'embed', 'annotation', 'lat-link', 'ambiguous-link', 'adoc-include', 'adoc-visible-edge', 'too-many-elements', 'missing-attribute', 'attribute-value-not-allowed', 'unclosed-element']);

/** Severity of a finding code; unknown codes are warnings. */
// @tg: implements:: [[openspec:tg-validate#Finding codes and severities]]
export function severityOf(code: string): Severity {
  return ERROR_CODES.has(code) ? 'error' : 'warning';
}

/** Turn diagnostics into findings sorted by path, line and code. */
// @tg: implements:: [[openspec:tg-validate#Finding codes and severities]]
export function toFindings(diagnostics: readonly Diagnostic[]): VaultFinding[] {
  return diagnostics
    .map((d): VaultFinding => {
      const code = d.code ?? 'invalid-declaration';
      return { code, severity: severityOf(code), path: d.path, line: d.line > 0 || LINE_CODES.has(code) ? d.line + 1 : null, message: d.message };
    })
    .sort(
      (a, b) =>
        (a.path ?? '').localeCompare(b.path ?? '') || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code) || a.message.localeCompare(b.message),
    );
}

export interface DiagnosticSources {
  graph: Graph;
  schemas: SchemaSet;
  /** Style diagnostics, which the host builds with its own settings and icon check. */
  style: readonly Diagnostic[];
  embeds?: EmbedIndex | null;
}

/**
 * Every vault diagnostic the plugin lists, apart from lat.md links: edge
 * syntax, schema declarations, schema validation, style and edge embeds.
 */
// @tg: implements:: [[openspec:tg-validate#Same findings as the plugin]]
export function vaultDiagnostics(src: DiagnosticSources): Diagnostic[] {
  return [...src.graph.diagnostics(), ...src.schemas.diagnostics, ...validateSchemas(src.graph, src.schemas), ...noteDocumentDiagnostics(src.graph, src.schemas), ...src.style, ...(src.embeds?.warnings(src.graph) ?? [])];
}

export interface ValidateOptions {
  /** Schema folder, default `Types/`. */
  schemaFolder?: string;
  /** Also read plain prose links as `links_to` edges. */
  linkEdges?: boolean;
  /** Also read links in frontmatter properties as edges typed by the property name. */
  frontmatterEdges?: boolean;
  /** Check only the schema notes' declarations. */
  schemaOnly?: boolean;
  iconExists?: IconCheck;
  /** YAML parser for AsciiDoc property blocks; without one a small flat reader is used. */
  parseYaml?: YamlParser;
}

/** Validate parsed vault notes against their schema notes; never changes them. */
// @tg: implements:: [[openspec:tg-validate#Validate a vault]]
// @tg: implements:: [[openspec:tg-validate#Selecting findings]]
export function validateVault(notes: readonly NoteInput[], options: ValidateOptions = {}): VaultFinding[] {
  const folder = options.schemaFolder ?? DEFAULT_SCHEMA_FOLDER;
  if (options.schemaOnly) {
    const schemaNotes = notes.filter((n) => isSchemaPath(n.path, folder)).map((n) => readSchemaNote(n.path, n.frontmatter));
    return toFindings(schemaSetFromNotes(schemaNotes).diagnostics);
  }
  const paths = notes.map((n) => n.path);
  const graph = new Graph(pathResolver(() => paths), undefined, { linkEdges: options.linkEdges ?? false, frontmatterEdges: options.frontmatterEdges ?? false, parseYaml: options.parseYaml });
  const embeds = new EmbedIndex();
  for (const n of notes) {
    embeds.upsert(n.path, n.text);
    graph.upsertNote(n);
  }
  const schemas = schemasFromGraph(graph, folder);
  const style = styleSourcesFromSchemas(schemas.schemas, options.iconExists, schemas.edgeTypes).diagnostics;
  return toFindings(vaultDiagnostics({ graph, schemas, style, embeds }));
}
