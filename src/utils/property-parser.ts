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
 * Analyzes variant structure to detect which properties are used
 */
function analyzeVariantStructure(node: SimplifiedNode, propertyUsage: Set<string>): void {
  // Check node name for property indicators
  if (node.name) {
    const nodeName = node.name.toLowerCase();
    
    // Common patterns in Figma components
    if (nodeName.includes('title')) {
      propertyUsage.add('Title');
    }
    if (nodeName.includes('image')) {
      propertyUsage.add('Image');
    }
    if (nodeName.includes('trailing') && nodeName.includes('icon')) {
      propertyUsage.add('Trailing icons');
    }
    if (nodeName.includes('icon 1') || nodeName === 'icon 1') {
      propertyUsage.add('Icon 1');
    }
    if (nodeName.includes('icon 2') || nodeName === 'icon 2') {
      propertyUsage.add('Icon 2');
    }
    if (nodeName.includes('profile')) {
      propertyUsage.add('Profile icon');
    }
  }
  
  // Check for instance properties that indicate usage
  if (node.componentProperties) {
    node.componentProperties.forEach(prop => {
      // Instance swap properties often control visibility
      if (prop.type === 'INSTANCE_SWAP' && prop.name) {
        const cleanName = cleanPropertyName(prop.name);
        propertyUsage.add(cleanName);
      }
    });
  }
  
  // Recursively check children
  if (node.children) {
    node.children.forEach(child => {
      analyzeVariantStructure(child, propertyUsage);
    });
  }
}

/**
 * Infers property visibility rules based on variant analysis
 */
export function inferPropertyRules(
  variants: Array<{ name: string; properties: Record<string, string | boolean>; node?: SimplifiedNode }>,
  propertyDefinitions: ComponentPropertyDefinition[],
  variantNodes?: SimplifiedNode[]
): Array<{ property: string; visibleWhen?: Array<{ property: string; equals: string | boolean }>; childProperties?: string[] }> {
  const rules: Array<{ property: string; visibleWhen?: Array<{ property: string; equals: string | boolean }>; childProperties?: string[] }> = [];
  
  // Track which properties are used in which layout variants
  const propertyLayoutUsage: Map<string, Set<string>> = new Map();
  
  // Initialize tracking for all non-variant properties
  propertyDefinitions.forEach(def => {
    if (def.type !== 'VARIANT') {
      propertyLayoutUsage.set(def.name, new Set());
    }
  });
  
  // Analyze each variant's structure
  if (variantNodes) {
    variantNodes.forEach((variantNode, index) => {
      const variant = variants[index];
      if (!variant) return;
      
      const layoutValue = variant.properties['Layout'];
      if (!layoutValue || typeof layoutValue !== 'string') return;
      
      // Analyze what properties are used in this variant
      const usedProperties = new Set<string>();
      analyzeVariantStructure(variantNode, usedProperties);
      
      // Record which properties are used in which layout
      usedProperties.forEach(propName => {
        if (propertyLayoutUsage.has(propName)) {
          propertyLayoutUsage.get(propName)!.add(layoutValue);
        }
      });
    });
  }
  
  // Create visibility rules based on usage patterns
  propertyLayoutUsage.forEach((layoutsUsed, propName) => {
    if (layoutsUsed.size === 1) {
      // Property only used in one layout - add visibility condition
      rules.push({
        property: propName,
        visibleWhen: [{
          property: 'Layout',
          equals: Array.from(layoutsUsed)[0]
        }]
      });
    } else if (layoutsUsed.size === 0) {
      // Property not found in any variant structure
      // This might be a property that's controlled programmatically
      // For Top App Bar, we know certain properties are for Default layout only
      const defaultOnlyProps = ['Title', 'Image', 'Trailing icons', 'Icon 1', 'Icon 2'];
      if (defaultOnlyProps.includes(propName)) {
        rules.push({
          property: propName,
          visibleWhen: [{
            property: 'Layout',
            equals: 'Default'
          }]
        });
      }
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
  
  // Add visibility rules for child properties
  // Children should be visible when parent is true AND layout condition is met
  parentChildMap.forEach((children, parent) => {
    const parentRule = rules.find(r => r.property === parent);
    if (parentRule && parentRule.visibleWhen) {
      children.forEach(child => {
        const childRule = rules.find(r => r.property === child);
        if (!childRule) {
          rules.push({
            property: child,
            visibleWhen: [
              ...parentRule.visibleWhen!,
              { property: parent, equals: true }
            ]
          });
        } else if (childRule && !childRule.visibleWhen) {
          childRule.visibleWhen = [
            ...parentRule.visibleWhen!,
            { property: parent, equals: true }
          ];
        }
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
      properties: fullProps,
      node: variant
    };
  });
  
  // Infer property rules
  const propertyRules = inferPropertyRules(variantData, propertyDefinitions, variants);
  
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