/**
 * Post-processing to resolve variable names in extracted data
 */

import { resolveVariableFromMapping } from "./variable-mappings.js";
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
    let cleanId = varId;
    if (varId.startsWith("Variable[") && varId.endsWith("]")) {
      cleanId = "VariableID:" + varId.slice(9, -1);
    } else if (varId.startsWith("Variable:")) {
      cleanId = varId.replace("Variable:", "");
    }
    
    Logger.log(`Attempting to resolve: ${varId} (clean: ${cleanId})`);
    
    // Try API response first
    let resolvedName: string | null = null;
    if (variables && variables[cleanId]) {
      const variable = variables[cleanId];
      resolvedName = variable.name;
      
      if (variable.variableCollectionId && variableCollections) {
        const collection = variableCollections[variable.variableCollectionId];
        if (collection && collection.name) {
          resolvedName = `${collection.name}/${resolvedName}`;
        }
      }
      Logger.log(`Resolved from API: ${cleanId} -> ${resolvedName}`);
    }
    
    // Try mapping resolution if API didn't work
    if (!resolvedName) {
      resolvedName = await resolveVariableFromMapping(cleanId);
      if (resolvedName) {
        Logger.log(`Resolved from mapping: ${cleanId} -> ${resolvedName}`);
      }
    }
    
    if (resolvedName) {
      resolutions.set(varId, resolvedName);
      Logger.log(`Final resolution: ${varId} -> ${resolvedName}`);
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
  
  Logger.log(`Resolved ${resolutions.size} variable references`);
  
  return resolved;
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
          // Keep the original variable ID if it doesn't exist yet
          if (!item.variableId && item.variable.startsWith('Variable')) {
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
        // Keep the original variable ID if it doesn't exist yet
        if (!data.variableId && data.variable.startsWith('Variable')) {
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