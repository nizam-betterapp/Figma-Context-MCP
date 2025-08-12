import type { Component, ComponentPropertyType, ComponentSet } from "@figma/rest-api-spec";

export interface ComponentProperties {
  name: string;
  value: string;
  type: ComponentPropertyType;
}

export interface ComponentPropertyDefinition {
  name: string;
  type: 'BOOLEAN' | 'TEXT' | 'VARIANT' | 'INSTANCE_SWAP';
  defaultValue: boolean | string;
  variantOptions?: string[];
  preferredValues?: Array<{ type: 'COMPONENT' | 'COMPONENT_SET'; key: string }>;
}

export interface SimplifiedComponentDefinition {
  id: string;
  key: string;
  name: string;
  componentSetId?: string;
  description?: string;
  documentationLinks?: Array<{ uri: string }>;
  componentPropertyDefinitions?: Record<string, ComponentPropertyDefinition>;
  remote?: boolean;
}

export interface SimplifiedComponentSetDefinition {
  id: string;
  key: string;
  name: string;
  description?: string;
  documentationLinks?: Array<{ uri: string }>;
  componentPropertyDefinitions?: Record<string, ComponentPropertyDefinition>;
  defaultVariantId?: string;
  remote?: boolean;
}

/**
 * Remove unnecessary component properties and convert to simplified format.
 */
export function simplifyComponents(
  aggregatedComponents: Record<string, Component>,
): Record<string, SimplifiedComponentDefinition> {
  return Object.fromEntries(
    Object.entries(aggregatedComponents).map(([id, comp]) => [
      id,
      {
        id,
        key: comp.key,
        name: comp.name,
        componentSetId: comp.componentSetId,
        description: comp.description,
        documentationLinks: comp.documentationLinks,
        remote: comp.remote,
        // Note: componentPropertyDefinitions will be extracted by the node walker
        // from the actual component nodes, not from the components metadata
      },
    ]),
  );
}

/**
 * Remove unnecessary component set properties and convert to simplified format.
 */
export function simplifyComponentSets(
  aggregatedComponentSets: Record<string, ComponentSet>,
): Record<string, SimplifiedComponentSetDefinition> {
  return Object.fromEntries(
    Object.entries(aggregatedComponentSets).map(([id, set]) => [
      id,
      {
        id,
        key: set.key,
        name: set.name,
        description: set.description,
        documentationLinks: set.documentationLinks,
        remote: set.remote,
        // Note: componentPropertyDefinitions and defaultVariantId will be extracted 
        // by the node walker from the actual component set nodes
      },
    ]),
  );
}
