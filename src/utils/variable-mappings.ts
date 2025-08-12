/**
 * Variable mappings for known design systems
 * 
 * This file contains mappings of Figma variable IDs to their semantic names
 * for cases where the variables API cannot resolve them (e.g., library variables).
 * 
 * Users can extend this with their own mappings for their design system.
 */

export interface VariableMapping {
  id: string;
  name: string;
  description?: string;
}

// Default mappings for common design system patterns
// These are based on common patterns observed in design systems
export const DEFAULT_VARIABLE_MAPPINGS: VariableMapping[] = [
  // Material Design 3 style mappings (example)
  { id: "VariableID:50:7", name: "Surface/Inverse", description: "Inverse surface color" },
  { id: "VariableID:54:2", name: "Content/Inverse", description: "Inverse content color" },
  { id: "VariableID:50:6", name: "Surface/Primary", description: "Primary surface color" },
  { id: "VariableID:54:1", name: "Content/Primary", description: "Primary content color" },
  
  // Add more mappings as discovered
];

/**
 * Get a user-defined mapping file if it exists
 */
export function getUserVariableMappings(): VariableMapping[] {
  // In a real implementation, this could read from:
  // - A .figma-variables.json file in the project root
  // - Environment variables
  // - A configuration file
  
  // For now, return empty array
  return [];
}

/**
 * Resolve a variable ID to its semantic name using mappings
 */
export function resolveVariableFromMapping(
  variableId: string,
  customMappings?: VariableMapping[]
): string | null {
  // Clean the variable ID (remove VariableID: prefix if present)
  const cleanId = variableId.replace('VariableID:', '');
  const fullId = variableId.startsWith('VariableID:') ? variableId : `VariableID:${variableId}`;
  
  // Check custom mappings first
  if (customMappings) {
    const customMapping = customMappings.find(m => m.id === fullId || m.id === cleanId);
    if (customMapping) return customMapping.name;
  }
  
  // Check user mappings
  const userMappings = getUserVariableMappings();
  const userMapping = userMappings.find(m => m.id === fullId || m.id === cleanId);
  if (userMapping) return userMapping.name;
  
  // Check default mappings
  const defaultMapping = DEFAULT_VARIABLE_MAPPINGS.find(m => m.id === fullId || m.id === cleanId);
  if (defaultMapping) return defaultMapping.name;
  
  return null;
}

/**
 * Format a variable reference for display
 * Shows the semantic name if available, otherwise a formatted ID
 */
export function formatVariableReference(
  variableId: string,
  resolvedName?: string | null
): string {
  if (resolvedName) {
    return resolvedName;
  }
  
  // If no resolved name, format the ID nicely
  // Remove VariableID: prefix and format as Variable[ID]
  const cleanId = variableId.replace('VariableID:', '');
  const parts = cleanId.split(':');
  
  if (parts.length === 2) {
    return `Variable[${parts[0]}:${parts[1]}]`;
  }
  
  return `Variable[${cleanId}]`;
}