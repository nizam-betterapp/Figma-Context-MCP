import type { Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import type { StyleId } from "~/utils/common.js";
import type { SimplifiedTextStyle } from "~/transformers/text.js";
import type { SimplifiedLayout } from "~/transformers/layout.js";
import type { SimplifiedFill, SimplifiedStroke } from "~/transformers/style.js";
import type { SimplifiedEffects } from "~/transformers/effects.js";
import type {
  ComponentProperties,
  SimplifiedComponentDefinition,
  SimplifiedComponentSetDefinition,
} from "~/transformers/component.js";

export interface ComponentPropertyDefinition {
  name: string;
  type: 'BOOLEAN' | 'TEXT' | 'VARIANT' | 'INSTANCE_SWAP';
  defaultValue: boolean | string;
  variantOptions?: string[];
  preferredValues?: Array<{ type: 'COMPONENT' | 'COMPONENT_SET'; key: string }>;
}

export type StyleTypes =
  | SimplifiedTextStyle
  | SimplifiedFill[]
  | SimplifiedLayout
  | SimplifiedStroke
  | SimplifiedEffects
  | string;

export type GlobalVars = {
  styles: Record<StyleId, StyleTypes>;
};

export interface TraversalContext {
  globalVars: GlobalVars;
  currentDepth: number;
  parent?: FigmaDocumentNode;
  variables?: Record<string, any>;
  variableCollections?: Record<string, any>;
}

export interface TraversalOptions {
  maxDepth?: number;
  nodeFilter?: (node: FigmaDocumentNode) => boolean;
  variables?: Record<string, any>;
  variableCollections?: Record<string, any>;
}

/**
 * An extractor function that can modify a SimplifiedNode during traversal.
 *
 * @param node - The current Figma node being processed
 * @param result - SimplifiedNode object being built—this can be mutated inside the extractor
 * @param context - Traversal context including globalVars and parent info. This can also be mutated inside the extractor.
 */
export type ExtractorFn = (
  node: FigmaDocumentNode,
  result: SimplifiedNode,
  context: TraversalContext,
) => void;

export interface SimplifiedDesign {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  nodes: SimplifiedNode[];
  components: Record<string, SimplifiedComponentDefinition>;
  componentSets: Record<string, SimplifiedComponentSetDefinition>;
  globalVars: GlobalVars;
}

export interface SimplifiedNode {
  id: string;
  name: string;
  type: string; // e.g. FRAME, TEXT, INSTANCE, RECTANGLE, COMPONENT, COMPONENT_SET, etc.
  // text
  text?: string;
  textStyle?: string;
  // appearance
  fills?: string;
  styles?: string;
  strokes?: string;
  effects?: string;
  opacity?: number;
  borderRadius?: string;
  // layout & alignment
  layout?: string;
  
  // Instance-specific properties
  componentId?: string;
  mainComponent?: string;
  componentProperties?: ComponentProperties[];
  exposedInstances?: Record<string, string>;
  
  // Component/ComponentSet-specific properties
  key?: string;
  description?: string;
  documentationLinks?: Array<{ uri: string }>;
  componentPropertyDefinitions?: ComponentPropertyDefinition[];
  defaultVariantId?: string; // For component sets
  componentSetId?: string; // For components that are variants
  
  // children
  children?: SimplifiedNode[];
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
