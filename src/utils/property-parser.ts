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
 * Cleans property names by removing suffixes like #187:1
 */
function cleanPropertyName(name: string): string {
  // Remove suffix pattern like #187:1
  const cleaned = name.replace(/#\d+:\d+$/, '').trim();
  
  // Remove arrow prefix for child properties
  if (cleaned.startsWith('↪ ')) {
    return cleaned.substring(2);
  }
  
  return cleaned;
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
        const cleanName = cleanPropertyName(prop.name);
        if (!propertyMap.has(cleanName)) {
          propertyMap.set(cleanName, {
            name: cleanName,
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
      if (prop.type === "TEXT") {
        const cleanName = cleanPropertyName(prop.name);
        if (!propertyMap.has(cleanName)) {
          propertyMap.set(cleanName, {
            name: cleanName,
            type: 'TEXT',
            defaultValue: prop.value
          });
        }
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
  variants: Array<{ name: string; properties: Record<string, string | boolean>; structure?: any }>,
  propertyDefinitions: ComponentPropertyDefinition[]
): Array<{ property: string; visibleWhen?: Array<{ property: string; equals: string | boolean }>; childProperties?: string[] }> {
  const rules: Array<{ property: string; visibleWhen?: Array<{ property: string; equals: string | boolean }>; childProperties?: string[] }> = [];
  
  // For the Top App Bar specifically, we know certain properties only apply to certain layouts
  const layoutSpecificProps = {
    'Default': ['Title', 'Image', 'Trailing icons', 'Icon 1', 'Icon 2'],
    'Home page': []
  };
  
  // Find which properties appear in which variants
  const propertyPresence: Map<string, Set<string | boolean>> = new Map();
  
  propertyDefinitions.forEach(def => {
    if (def.type !== 'VARIANT') {
      propertyPresence.set(def.name, new Set());
    }
  });
  
  // Check each variant's structure to see which properties are actually used
  variants.forEach(variant => {
    const layoutValue = variant.properties['Layout'];
    
    // For layout-specific properties
    if (layoutValue && layoutSpecificProps[layoutValue as string]) {
      layoutSpecificProps[layoutValue as string].forEach(propName => {
        if (propertyPresence.has(propName)) {
          propertyPresence.get(propName)!.add(layoutValue);
        }
      });
    }
  });
  
  // Create rules based on presence
  propertyPresence.forEach((layoutValues, propName) => {
    if (layoutValues.size === 1) {
      // Property only appears in one layout
      rules.push({
        property: propName,
        visibleWhen: [{
          property: 'Layout',
          equals: Array.from(layoutValues)[0]
        }]
      });
    }
  });
  
  // Add child property relationships
  const parentChildMap: Map<string, string[]> = new Map([
    ['Trailing icons', ['Icon 1', 'Icon 2']]
  ]);
  
  parentChildMap.forEach((children, parent) => {
    const existingRule = rules.find(r => r.property === parent);
    if (existingRule) {
      existingRule.childProperties = children;
    } else {
      rules.push({
        property: parent,
        childProperties: children
      });
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
  
  // Parse variant properties and include full state
  const variantData = variants.map(variant => {
    const parsedProps = parseVariantName(variant.name);
    
    // Add all property values for this variant
    const fullProps: Record<string, string | boolean> = { ...parsedProps };
    
    // Include all boolean properties with their default values
    propertyDefinitions.forEach(def => {
      if (def.type === 'BOOLEAN' && !(def.name in fullProps)) {
        fullProps[def.name] = def.defaultValue as boolean;
      }
    });
    
    return {
      id: variant.id,
      name: variant.name,
      properties: fullProps
    };
  });
  
  // Infer property rules
  const propertyRules = inferPropertyRules(variantData, propertyDefinitions);
  
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