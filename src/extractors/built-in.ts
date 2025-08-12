import type { Node as FigmaDocumentNode } from "@figma/rest-api-spec";
import type { ExtractorFn } from "./types.js";
import { buildSimplifiedLayout } from "~/transformers/layout.js";
import { buildSimplifiedStrokes, parsePaint } from "~/transformers/style.js";
import { buildSimplifiedEffects } from "~/transformers/effects.js";
import {
  extractNodeText,
  extractTextStyle,
  hasTextStyle,
  isTextNode,
} from "~/transformers/text.js";
import { hasValue, isRectangleCornerRadii } from "~/utils/identity.js";
import { generateVarId } from "~/utils/common.js";
import { resolveVariableFromMapping, formatVariableReference } from "~/utils/variable-mappings.js";

/**
 * Helper function to find or create a global variable.
 */
function findOrCreateVar(globalVars: any, value: any, prefix: string): string {
  // Check if the same value already exists
  const [existingVarId] =
    Object.entries(globalVars.styles).find(
      ([_, existingValue]) => JSON.stringify(existingValue) === JSON.stringify(value),
    ) ?? [];

  if (existingVarId) {
    return existingVarId;
  }

  // Create a new variable if it doesn't exist
  const varId = generateVarId(prefix);
  globalVars.styles[varId] = value;
  return varId;
}

/**
 * Extracts layout-related properties from a node.
 */
export const layoutExtractor: ExtractorFn = (node, result, context) => {
  const layout = buildSimplifiedLayout(node, context.parent);
  if (Object.keys(layout).length > 1) {
    result.layout = findOrCreateVar(context.globalVars, layout, "layout");
  }
};

/**
 * Extracts text content and text styling from a node.
 */
export const textExtractor: ExtractorFn = (node, result, context) => {
  // Extract text content
  if (isTextNode(node)) {
    result.text = extractNodeText(node);
  }

  // Extract text style
  if (hasTextStyle(node)) {
    const textStyle = extractTextStyle(node);
    result.textStyle = findOrCreateVar(context.globalVars, textStyle, "style");
  }
};

/**
 * Helper function to resolve variable names from boundVariables
 */
function resolveVariableName(
  variableId: string,
  variables: Record<string, any> | undefined,
  variableCollections: Record<string, any> | undefined,
): string | null {
  if (!variableId) return null;
  
  // First, try to get it from the API response
  if (variables && variables[variableId]) {
    const variable = variables[variableId];
    let name = variable.name;
    
    // If the variable belongs to a collection, prepend the collection name
    if (variable.variableCollectionId && variableCollections) {
      const collection = variableCollections[variable.variableCollectionId];
      if (collection && collection.name) {
        // Format as "CollectionName/VariableName" to match Figma's display
        name = `${collection.name}/${name}`;
      }
    }
    return name;
  }
  
  // Second, try to resolve from known mappings
  const mappedName = resolveVariableFromMapping(variableId);
  if (mappedName) {
    return mappedName;
  }
  
  // Finally, format the variable ID nicely
  return formatVariableReference(variableId);
}

/**
 * Extracts visual appearance properties (fills, strokes, effects, opacity, border radius).
 */
export const visualsExtractor: ExtractorFn = (node, result, context) => {
  // Check if node has children to determine CSS properties
  const hasChildren = hasValue("children", node) && Array.isArray(node.children) && node.children.length > 0;
  
  // fills with variable resolution
  if (hasValue("fills", node) && Array.isArray(node.fills) && node.fills.length) {
    const fills = node.fills.map((fill, index) => {
      const parsedFill = parsePaint(fill, hasChildren);
      
      // Check if this fill has a bound variable (can be in two places)
      let variableBinding = null;
      
      // 1. Check node-level boundVariables.fills
      if ((node as any).boundVariables?.fills?.[index]) {
        variableBinding = (node as any).boundVariables.fills[index];
      }
      // 2. Check fill-level boundVariables.color
      else if (fill.type === 'SOLID' && (fill as any).boundVariables?.color) {
        variableBinding = (fill as any).boundVariables.color;
      }
      
      if (variableBinding && variableBinding.id) {
        const variableName = resolveVariableName(variableBinding.id, context.variables, context.variableCollections);
        
        if (variableName) {
          // Return an object with both the parsed value and the variable name
          return {
            value: parsedFill,
            variable: variableName,
          };
        }
      }
      
      return parsedFill;
    });
    result.fills = findOrCreateVar(context.globalVars, fills, "fill");
  }

  // strokes with variable resolution
  const strokes = buildSimplifiedStrokes(node, hasChildren);
  if (strokes.colors.length) {
    // Check for stroke variable bindings
    if ((node as any).boundVariables?.strokes) {
      const strokesWithVariables = {
        ...strokes,
        colors: strokes.colors.map((color, index) => {
          const boundVar = (node as any).boundVariables.strokes?.[index];
          if (boundVar) {
            const variableName = resolveVariableName(boundVar.id, context.variables, context.variableCollections);
            if (variableName) {
              return {
                value: color,
                variable: variableName,
              };
            }
          }
          return color;
        }),
      };
      result.strokes = findOrCreateVar(context.globalVars, strokesWithVariables, "stroke");
    } else {
      result.strokes = findOrCreateVar(context.globalVars, strokes, "stroke");
    }
  }

  // effects
  const effects = buildSimplifiedEffects(node);
  if (Object.keys(effects).length) {
    result.effects = findOrCreateVar(context.globalVars, effects, "effect");
  }

  // opacity
  if (hasValue("opacity", node) && typeof node.opacity === "number" && node.opacity !== 1) {
    result.opacity = node.opacity;
  }

  // border radius
  if (hasValue("cornerRadius", node) && typeof node.cornerRadius === "number") {
    result.borderRadius = `${node.cornerRadius}px`;
  }
  if (hasValue("rectangleCornerRadii", node, isRectangleCornerRadii)) {
    result.borderRadius = `${node.rectangleCornerRadii[0]}px ${node.rectangleCornerRadii[1]}px ${node.rectangleCornerRadii[2]}px ${node.rectangleCornerRadii[3]}px`;
  }
};

/**
 * Extracts component-related properties from INSTANCE nodes.
 */
export const componentExtractor: ExtractorFn = (node, result, context) => {
  if (node.type === "INSTANCE") {
    if (hasValue("componentId", node)) {
      result.componentId = node.componentId;
    }

    // Add specific properties for instances of components
    if (hasValue("componentProperties", node)) {
      result.componentProperties = Object.entries(node.componentProperties ?? {}).map(
        ([name, { value, type }]) => ({
          name,
          value: value.toString(),
          type,
        }),
      );
    }
  }
};

// -------------------- CONVENIENCE COMBINATIONS --------------------

/**
 * All extractors - replicates the current parseNode behavior.
 */
export const allExtractors = [layoutExtractor, textExtractor, visualsExtractor, componentExtractor];

/**
 * Layout and text only - useful for content analysis and layout planning.
 */
export const layoutAndText = [layoutExtractor, textExtractor];

/**
 * Text content only - useful for content audits and copy extraction.
 */
export const contentOnly = [textExtractor];

/**
 * Visuals only - useful for design system analysis and style extraction.
 */
export const visualsOnly = [visualsExtractor];

/**
 * Layout only - useful for structure analysis.
 */
export const layoutOnly = [layoutExtractor];
