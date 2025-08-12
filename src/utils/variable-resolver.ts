/**
 * Post-processing to resolve variable names and text styles in extracted data
 */

import { resolveVariableFromMapping, resolveTextStyleFromMapping } from "./variable-mappings.js";
import { Logger } from "./logger.js";

/**
 * Resolve all variable references in the extracted design data
 */
export async function resolveVariablesInDesign(
  simplifiedDesign: any,
  variables?: Record<string, any>,
  variableCollections?: Record<string, any>
): Promise<any> {
  Logger.log("Resolving variable references in design data...");
  
  // Deep clone the design to avoid mutation
  const resolved = JSON.parse(JSON.stringify(simplifiedDesign));
  
  // Track unique variable IDs to resolve
  const variableIds = new Set<string>();
  
  // Find all variable references in globalVars.styles
  if (resolved.globalVars && resolved.globalVars.styles) {
    for (const styleData of Object.values(resolved.globalVars.styles)) {
      findVariableIds(styleData, variableIds);
    }
  }
  
  Logger.log(`Found ${variableIds.size} unique variable IDs to resolve`);
  
  // Resolve all variable IDs
  const resolutions = new Map<string, string>();
  
  for (const varId of variableIds) {
    // Extract the actual ID from formatted references like "Variable[54:6]"
    let variableIdForLookup = varId;
    
    if (varId.startsWith("Variable[") && varId.endsWith("]")) {
      // Format is Variable[XX:YY] - extract the XX:YY part and format as VariableID:XX:YY
      const idPart = varId.slice(9, -1);
      variableIdForLookup = `VariableID:${idPart}`;
    }
    
    // Simply resolve from our design_system_tokens.json mappings
    const resolvedName = await resolveVariableFromMapping(variableIdForLookup);
    
    if (resolvedName) {
      resolutions.set(varId, resolvedName);
      Logger.log(`Resolved: ${varId} -> ${resolvedName}`);
    } else {
      Logger.log(`Could not resolve: ${varId}`);
    }
  }
  
  // Apply resolutions
  if (resolved.globalVars && resolved.globalVars.styles) {
    for (const styleData of Object.values(resolved.globalVars.styles)) {
      applyResolutions(styleData, resolutions);
    }
  }
  
  // Resolve text styles
  await resolveTextStyles(resolved);
  
  Logger.log(`Resolved ${resolutions.size} variable references`);
  
  return resolved;
}

/**
 * Resolve text style IDs to semantic names
 */
async function resolveTextStyles(data: any): Promise<void> {
  if (!data.globalVars || !data.globalVars.styles) return;
  
  const { resolveTextStyleFromMapping, resolveTextStyleByProperties } = await import("./variable-mappings.js");
  let textStyleCount = 0;
  
  for (const [styleId, styleData] of Object.entries(data.globalVars.styles)) {
    if (styleData && typeof styleData === 'object') {
      const textStyleId = (styleData as any).textStyleId;
      
      if (textStyleId) {
        // First try to resolve by style ID
        let resolvedName = await resolveTextStyleFromMapping(textStyleId);
        
        // If not found by ID, try to match by properties
        if (!resolvedName && (styleData as any).fontFamily) {
          resolvedName = await resolveTextStyleByProperties({
            fontFamily: (styleData as any).fontFamily,
            fontSize: (styleData as any).fontSize,
            fontWeight: (styleData as any).fontWeight,
            lineHeight: (styleData as any).lineHeight
          });
          
          if (resolvedName) {
            Logger.log(`Resolved text style by properties: ${JSON.stringify({
              fontSize: (styleData as any).fontSize,
              fontWeight: (styleData as any).fontWeight
            })} -> ${resolvedName}`);
          }
        }
        
        if (resolvedName) {
          // Replace the entire style data with the semantic name
          data.globalVars.styles[styleId] = resolvedName;
          textStyleCount++;
        } else {
          Logger.log(`Could not resolve text style: ${textStyleId}`);
        }
      }
    }
  }
  
  if (textStyleCount > 0) {
    Logger.log(`Resolved ${textStyleCount} text styles`);
  }
}

/**
 * Find all variable IDs in a data structure
 */
function findVariableIds(data: any, variableIds: Set<string>): void {
  if (!data) return;
  
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object' && 'variable' in item) {
        variableIds.add(item.variable);
      } else {
        findVariableIds(item, variableIds);
      }
    }
  } else if (typeof data === 'object') {
    if ('variable' in data) {
      variableIds.add(data.variable);
    }
    
    for (const value of Object.values(data)) {
      findVariableIds(value, variableIds);
    }
  }
}

/**
 * Apply resolved variable names to the data
 */
function applyResolutions(data: any, resolutions: Map<string, string>): void {
  if (!data) return;
  
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item && typeof item === 'object' && 'variable' in item) {
        const resolved = resolutions.get(item.variable);
        if (resolved) {
          // Keep the original variable ID - convert Variable[XX:YY] to VariableID:XX:YY
          if (!item.variableId && item.variable.startsWith('Variable[')) {
            const idPart = item.variable.slice(9, -1); // Extract XX:YY from Variable[XX:YY]
            item.variableId = `VariableID:${idPart}`;
          } else if (!item.variableId) {
            item.variableId = item.variable;
          }
          item.variable = resolved;
        }
      } else {
        applyResolutions(item, resolutions);
      }
    }
  } else if (typeof data === 'object') {
    if ('variable' in data) {
      const resolved = resolutions.get(data.variable);
      if (resolved) {
        // Keep the original variable ID - convert Variable[XX:YY] to VariableID:XX:YY
        if (!data.variableId && data.variable.startsWith('Variable[')) {
          const idPart = data.variable.slice(9, -1); // Extract XX:YY from Variable[XX:YY]
          data.variableId = `VariableID:${idPart}`;
        } else if (!data.variableId) {
          data.variableId = data.variable;
        }
        data.variable = resolved;
      }
    }
    
    for (const value of Object.values(data)) {
      applyResolutions(value, resolutions);
    }
  }
}