import type { SimplifiedNode, ComponentPropertyDefinition } from "~/extractors/types.js";
import type { ComponentProperties } from "~/transformers/component.js";
import { Logger } from "~/utils/logger.js";

export interface ParsedPropertyDefinitions {
  properties: ComponentPropertyDefinition[];
  variantProperties: Record<string, string | boolean>;
}

/**
 * Parses component properties from variant names
 * Example: "Layout=Default, Title=true" -> properties and their values
 */
export function parseVariantName(variantName: string): Record<string, string | boolean> {
  const properties: Record<string, string | boolean> = {};
  
  // Split by comma and parse each property
  const parts = variantName.split(",").map(part => part.trim());
  
  parts.forEach(part => {
    const [key, value] = part.split("=").map(p => p.trim());
    if (key && value) {
      // Convert boolean strings to actual booleans
      if (value === "true" || value === "false") {
        properties[key] = value === "true";
      } else {
        properties[key] = value;
      }
    }
  });
  
  return properties;
}

/**
 * Extracts property definitions from a component set by analyzing its variants
 */
export function extractPropertyDefinitions(
  componentSetNode: SimplifiedNode,
  variants: SimplifiedNode[]
): ComponentPropertyDefinition[] {
  const propertyMap: Map<string, ComponentPropertyDefinition> = new Map();
  
  // Collect all properties and their values from variants
  variants.forEach(variant => {
    if (variant.type === "COMPONENT") {
      const variantProps = parseVariantName(variant.name);
      
      Object.entries(variantProps).forEach(([propName, value]) => {
        if (!propertyMap.has(propName)) {
          propertyMap.set(propName, {
            name: propName,
            type: 'VARIANT',
            defaultValue: '',
            variantOptions: []
          });
        }
        
        const propDef = propertyMap.get(propName)!;
        
        // Determine property type based on values
        if (typeof value === 'boolean') {
          propDef.type = 'BOOLEAN';
          propDef.defaultValue = propDef.defaultValue || false;
        } else {
          // Add to variant options if it's a string
          if (!propDef.variantOptions?.includes(value)) {
            propDef.variantOptions?.push(value);
          }
          if (!propDef.defaultValue) {
            propDef.defaultValue = value;
          }
        }
      });
    }
  });
  
  // Check for INSTANCE_SWAP properties by examining the component structure
  variants.forEach(variant => {
    findInstanceSwapProperties(variant, propertyMap);
  });
  
  // Check for TEXT properties
  variants.forEach(variant => {
    findTextProperties(variant, propertyMap);
  });
  
  return Array.from(propertyMap.values());
}

/**
 * Finds INSTANCE_SWAP properties in a component
 */
function findInstanceSwapProperties(
  node: SimplifiedNode,
  propertyMap: Map<string, ComponentPropertyDefinition>
): void {
  // Look for instance nodes that have component properties
  if (node.type === "INSTANCE" && node.componentProperties) {
    node.componentProperties.forEach(prop => {
      if (prop.type === "INSTANCE_SWAP") {
        if (!propertyMap.has(prop.name)) {
          propertyMap.set(prop.name, {
            name: prop.name,
            type: 'INSTANCE_SWAP',
            defaultValue: prop.value,
            preferredValues: []
          });
        }
      }
    });
  }
  
  // Recurse through children
  if (node.children) {
    node.children.forEach(child => {
      findInstanceSwapProperties(child, propertyMap);
    });
  }
}

/**
 * Finds TEXT properties in a component
 */
function findTextProperties(
  node: SimplifiedNode,
  propertyMap: Map<string, ComponentPropertyDefinition>
): void {
  // Look for text nodes or instances with TEXT properties
  if (node.componentProperties) {
    node.componentProperties.forEach(prop => {
      if (prop.type === "TEXT" && !propertyMap.has(prop.name)) {
        propertyMap.set(prop.name, {
          name: prop.name,
          type: 'TEXT',
          defaultValue: prop.value
        });
      }
    });
  }
  
  // Recurse through children
  if (node.children) {
    node.children.forEach(child => {
      findTextProperties(child, propertyMap);
    });
  }
}

/**
 * Infers property visibility rules based on variant analysis
 */
export function inferPropertyRules(
  variants: Array<{ name: string; properties: Record<string, string | boolean> }>
): Array<{ property: string; visibleWhen?: Array<{ property: string; equals: string | boolean }> }> {
  const rules: Array<{ property: string; visibleWhen?: Array<{ property: string; equals: string | boolean }> }> = [];
  const propertyCooccurrence: Map<string, Map<string, Set<string | boolean>>> = new Map();
  
  // Build co-occurrence map
  variants.forEach(variant => {
    const props = Object.keys(variant.properties);
    
    props.forEach(prop => {
      if (!propertyCooccurrence.has(prop)) {
        propertyCooccurrence.set(prop, new Map());
      }
      
      props.forEach(otherProp => {
        if (prop !== otherProp) {
          const coMap = propertyCooccurrence.get(prop)!;
          if (!coMap.has(otherProp)) {
            coMap.set(otherProp, new Set());
          }
          coMap.get(otherProp)!.add(variant.properties[otherProp]);
        }
      });
    });
  });
  
  // Analyze patterns
  propertyCooccurrence.forEach((coMap, prop) => {
    const visibleWhen: Array<{ property: string; equals: string | boolean }> = [];
    
    coMap.forEach((values, otherProp) => {
      // If this property only appears with specific values of another property
      if (values.size === 1) {
        visibleWhen.push({
          property: otherProp,
          equals: Array.from(values)[0]
        });
      }
    });
    
    if (visibleWhen.length > 0) {
      rules.push({ property: prop, visibleWhen });
    }
  });
  
  return rules;
}

/**
 * Enhances component set data with parsed property definitions
 */
export function enhanceComponentSetData(componentSetNode: SimplifiedNode): any {
  if (componentSetNode.type !== "COMPONENT_SET") {
    return null;
  }
  
  // Find all variants
  const variants: SimplifiedNode[] = [];
  if (componentSetNode.children) {
    componentSetNode.children.forEach(child => {
      if (child.type === "COMPONENT") {
        variants.push(child);
      }
    });
  }
  
  // Extract property definitions
  const propertyDefinitions = extractPropertyDefinitions(componentSetNode, variants);
  
  // Parse variant properties
  const variantData = variants.map(variant => ({
    id: variant.id,
    name: variant.name,
    properties: parseVariantName(variant.name)
  }));
  
  // Infer property rules
  const propertyRules = inferPropertyRules(variantData);
  
  return {
    id: componentSetNode.id,
    name: componentSetNode.name,
    type: "COMPONENT_SET",
    key: componentSetNode.key,
    description: componentSetNode.description,
    propertyDefinitions,
    variants: variantData,
    propertyRules,
    // Include the original node data
    ...componentSetNode
  };
}