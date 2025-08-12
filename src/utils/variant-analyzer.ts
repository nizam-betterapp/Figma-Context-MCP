import type { SimplifiedNode } from "~/extractors/types.js";
import { Logger } from "~/utils/logger.js";

export interface VariantInfo {
  id: string;
  name: string;
  properties: Record<string, string | boolean>;
  structure?: SlotInfo[];
}

export interface SlotInfo {
  slot: string;
  content: string;
  nodeId?: string;
  accepts?: string[]; // Component keys that can be placed in this slot
}

export interface PropertyRule {
  property: string;
  visibleWhen?: Array<{
    property: string;
    equals?: string | boolean;
    notEquals?: string | boolean;
  }>;
  childProperties?: string[];
}

export interface ComponentVariantAnalysis {
  componentSetId: string;
  componentSetName: string;
  variants: VariantInfo[];
  propertyRules: PropertyRule[];
  slotDefinitions: Record<string, SlotInfo>;
}

/**
 * Analyzes a component set node to extract variant information
 */
export function analyzeComponentSet(
  componentSetNode: SimplifiedNode,
  allNodes: SimplifiedNode[]
): ComponentVariantAnalysis | null {
  if (componentSetNode.type !== "COMPONENT_SET") {
    return null;
  }

  const analysis: ComponentVariantAnalysis = {
    componentSetId: componentSetNode.id,
    componentSetName: componentSetNode.name,
    variants: [],
    propertyRules: [],
    slotDefinitions: {}
  };

  // Find all component variants within this component set
  const variants = findVariants(componentSetNode, allNodes);
  
  // Extract property combinations from each variant
  variants.forEach(variant => {
    const variantInfo = extractVariantInfo(variant);
    if (variantInfo) {
      analysis.variants.push(variantInfo);
    }
  });

  // Analyze property relationships and visibility rules
  analysis.propertyRules = analyzePropertyRules(analysis.variants, componentSetNode);
  
  // Extract slot definitions
  analysis.slotDefinitions = extractSlotDefinitions(variants);

  return analysis;
}

/**
 * Finds all component variants within a component set
 */
function findVariants(componentSetNode: SimplifiedNode, allNodes: SimplifiedNode[]): SimplifiedNode[] {
  const variants: SimplifiedNode[] = [];
  
  // First check direct children
  if (componentSetNode.children) {
    componentSetNode.children.forEach(child => {
      if (child.type === "COMPONENT") {
        variants.push(child);
      }
    });
  }
  
  // Also check nodes that reference this component set
  allNodes.forEach(node => {
    if (node.type === "COMPONENT" && node.componentSetId === componentSetNode.id) {
      variants.push(node);
    }
  });
  
  return variants;
}

/**
 * Extracts variant information from a component node
 */
function extractVariantInfo(componentNode: SimplifiedNode): VariantInfo | null {
  if (componentNode.type !== "COMPONENT") {
    return null;
  }

  const properties: Record<string, string | boolean> = {};
  
  // Parse variant properties from the component name
  // Format: "Property1=Value1, Property2=Value2"
  const nameParts = componentNode.name.split(",").map(part => part.trim());
  
  nameParts.forEach(part => {
    const [key, value] = part.split("=").map(p => p.trim());
    if (key && value) {
      // Convert "true"/"false" strings to boolean
      if (value === "true" || value === "false") {
        properties[key] = value === "true";
      } else {
        properties[key] = value;
      }
    }
  });
  
  // Extract structure information
  const structure = extractStructure(componentNode);
  
  return {
    id: componentNode.id,
    name: componentNode.name,
    properties,
    structure
  };
}

/**
 * Extracts the structure/slots from a component
 */
function extractStructure(componentNode: SimplifiedNode): SlotInfo[] {
  const slots: SlotInfo[] = [];
  
  function traverseNode(node: SimplifiedNode, path: string = "") {
    // Check if this is an instance swap slot
    if (node.type === "INSTANCE" && node.componentProperties) {
      const swapProp = node.componentProperties.find(p => p.type === "INSTANCE_SWAP");
      if (swapProp) {
        slots.push({
          slot: node.name || path,
          content: `Instance swap: ${swapProp.name}`,
          nodeId: node.id,
          accepts: extractAcceptedComponents(node)
        });
      }
    }
    
    // Check for named slots based on layer names
    if (node.name && (node.name.includes("slot") || node.name.includes("Slot"))) {
      slots.push({
        slot: node.name,
        content: node.type,
        nodeId: node.id
      });
    }
    
    // Traverse children
    if (node.children) {
      node.children.forEach((child, index) => {
        traverseNode(child, `${path}/${child.name || index}`);
      });
    }
  }
  
  traverseNode(componentNode);
  return slots;
}

/**
 * Extract which components can be placed in an instance swap slot
 */
function extractAcceptedComponents(instanceNode: SimplifiedNode): string[] {
  const accepted: string[] = [];
  
  // Check for preferredValues in component properties
  if (instanceNode.componentProperties) {
    instanceNode.componentProperties.forEach(prop => {
      if ((prop as any).preferredValues) {
        (prop as any).preferredValues.forEach((pref: any) => {
          if (pref.key) {
            accepted.push(pref.key);
          }
        });
      }
    });
  }
  
  return accepted;
}

/**
 * Analyzes property rules and visibility conditions
 */
function analyzePropertyRules(
  variants: VariantInfo[],
  componentSetNode: SimplifiedNode
): PropertyRule[] {
  const rules: PropertyRule[] = [];
  const propertyOccurrences: Record<string, Set<string>> = {};
  
  // Collect which properties appear with which values
  variants.forEach(variant => {
    Object.entries(variant.properties).forEach(([prop, value]) => {
      if (!propertyOccurrences[prop]) {
        propertyOccurrences[prop] = new Set();
      }
      propertyOccurrences[prop].add(String(value));
    });
  });
  
  // Analyze co-occurrence patterns to detect visibility rules
  const propertyNames = Object.keys(propertyOccurrences);
  
  propertyNames.forEach(prop => {
    // Check if this property only appears when another property has specific values
    const appearsWith: Record<string, Set<string>> = {};
    
    variants.forEach(variant => {
      if (prop in variant.properties) {
        // This variant has the property, check what other properties it has
        propertyNames.forEach(otherProp => {
          if (otherProp !== prop && otherProp in variant.properties) {
            if (!appearsWith[otherProp]) {
              appearsWith[otherProp] = new Set();
            }
            appearsWith[otherProp].add(String(variant.properties[otherProp]));
          }
        });
      }
    });
    
    // Check if the property is conditional
    const visibleWhen: PropertyRule["visibleWhen"] = [];
    
    Object.entries(appearsWith).forEach(([otherProp, values]) => {
      // If this property only appears with specific values of another property
      const allValues = propertyOccurrences[otherProp];
      if (values.size < allValues.size) {
        // This property is conditional on the other property
        if (values.size === 1) {
          visibleWhen.push({
            property: otherProp,
            equals: Array.from(values)[0]
          });
        }
      }
    });
    
    if (visibleWhen.length > 0) {
      rules.push({
        property: prop,
        visibleWhen
      });
    }
  });
  
  // Extract child properties from component property definitions
  if (componentSetNode.componentPropertyDefinitions) {
    componentSetNode.componentPropertyDefinitions.forEach(def => {
      // Look for properties that might be grouped (e.g., "Icon 1", "Icon 2" under "Trailing icons")
      const parentMatch = def.name.match(/^(.+?)\s+\d+$/);
      if (parentMatch) {
        const parentName = parentMatch[1];
        const existingRule = rules.find(r => r.property === parentName);
        if (existingRule) {
          if (!existingRule.childProperties) {
            existingRule.childProperties = [];
          }
          existingRule.childProperties.push(def.name);
        }
      }
    });
  }
  
  return rules;
}

/**
 * Extracts slot definitions from all variants
 */
function extractSlotDefinitions(variants: SimplifiedNode[]): Record<string, SlotInfo> {
  const slots: Record<string, SlotInfo> = {};
  
  variants.forEach(variant => {
    const variantInfo = extractVariantInfo(variant);
    if (variantInfo && variantInfo.structure) {
      variantInfo.structure.forEach(slot => {
        if (!slots[slot.slot]) {
          slots[slot.slot] = slot;
        }
      });
    }
  });
  
  return slots;
}

/**
 * Analyzes all component sets in the design to extract variant information
 */
export function analyzeAllComponentSets(nodes: SimplifiedNode[]): ComponentVariantAnalysis[] {
  const analyses: ComponentVariantAnalysis[] = [];
  
  nodes.forEach(node => {
    if (node.type === "COMPONENT_SET") {
      const analysis = analyzeComponentSet(node, nodes);
      if (analysis) {
        analyses.push(analysis);
      }
    }
  });
  
  return analyses;
}