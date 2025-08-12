/**
 * Variable mappings from design system tokens
 * 
 * This file parses the design_system_tokens.json file to extract
 * Figma variable ID to semantic name mappings.
 */

import { Logger } from "~/utils/logger.js";
import fs from "fs";

export interface VariableMapping {
  id: string;
  name: string;
  description?: string;
}

// Cache for parsed mappings
let cachedMappings: VariableMapping[] | null = null;
let lastModTime: number = 0;

/**
 * Convert string to camelCase
 */
function toCamelCase(str: string): string {
  // Split by spaces, hyphens, or underscores
  const words = str.split(/[\s-_]+/);
  
  // Convert to camelCase
  return words.map((word, index) => {
    if (index === 0) {
      return word.toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join('');
}

/**
 * Parse design system tokens file format
 */
function parseDesignSystemTokens(content: string): VariableMapping[] {
  try {
    const tokens = JSON.parse(content);
    const mappings: VariableMapping[] = [];
    
    // Recursive function to extract variable mappings
    function extractMappings(obj: any, path: string[] = []) {
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = [...path, key];
        
        // Check if this object has a variableId in extensions
        if (value && typeof value === 'object') {
          const extensions = (value as any).extensions;
          if (extensions?.['org.lukasoppermann.figmaDesignTokens']?.variableId) {
            const variableId = extensions['org.lukasoppermann.figmaDesignTokens'].variableId;
            const collection = extensions['org.lukasoppermann.figmaDesignTokens'].collection || '';
            const type = (value as any).type || '';
            
            // Build the semantic name from the path
            let pathElements = [...currentPath];
            
            // Check if the first part of the path is a lowercase version of the collection name
            // This handles cases where the JSON has keys like "semantic tokens" but the collection is "Semantic Tokens"
            if (collection && pathElements[0]) {
              const firstPathNormalized = pathElements[0].toLowerCase().replace(/\s+/g, '');
              const collectionNormalized = collection.toLowerCase().replace(/\s+/g, '');
              
              if (firstPathNormalized === collectionNormalized) {
                // Remove the redundant prefix from the path
                pathElements = pathElements.slice(1);
              }
            }
            
            // Determine the prefix based on type or collection
            let prefix = '';
            if (type === 'color' || collection === 'Semantic Tokens') {
              prefix = 'RegainColors';
            } else if (type === 'dimension') {
              prefix = 'Dimensions';
            } else if (type === 'custom-fontStyle') {
              prefix = 'Typography';
            } else if (collection) {
              // Use collection name as prefix for other types
              prefix = collection.replace(/\s+/g, '');
            }
            
            // Convert path elements to camelCase and join with dots
            const camelCasePath = pathElements.map((elem, index) => {
              if (index === 0) {
                return elem.toLowerCase();
              }
              return toCamelCase(elem);
            }).join('.');
            
            // Build final name
            const name = prefix ? `${prefix}.${camelCasePath}` : camelCasePath;
            
            mappings.push({
              id: variableId,
              name: name,
              description: (value as any).description || ''
            });
          }
          
          // Continue recursion
          extractMappings(value, currentPath);
        }
      }
    }
    
    extractMappings(tokens);
    return mappings;
  } catch (error) {
    Logger.log(`Error parsing design system tokens: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Get variable mappings from design system tokens file
 */
function getLocalMappings(): VariableMapping[] {
  const designSystemTokensPath = '/Users/nizamsp/regainapp.ai-worktrees/mcp_with_colors/design_system_tokens.json';
  
  try {
    if (fs.existsSync(designSystemTokensPath)) {
      // Check if file has been modified
      const stats = fs.statSync(designSystemTokensPath);
      
      if (stats.mtimeMs !== lastModTime) {
        Logger.log(`Design system tokens file modified, reloading...`);
        cachedMappings = null; // Force cache refresh
        lastModTime = stats.mtimeMs;
      }
      
      if (cachedMappings) {
        return cachedMappings;
      }
      
      const content = fs.readFileSync(designSystemTokensPath, 'utf-8');
      const mappings = parseDesignSystemTokens(content);
      Logger.log(`Loaded ${mappings.length} mappings from design system tokens`);
      cachedMappings = mappings;
      return mappings;
    }
  } catch (error) {
    Logger.log(`Error loading design system tokens: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  Logger.log('Design system tokens file not found');
  return [];
}

/**
 * Get all variable mappings
 */
export async function getVariableMappings(): Promise<VariableMapping[]> {
  return getLocalMappings();
}

/**
 * Resolve a variable ID to its semantic name using mappings
 */
export async function resolveVariableFromMapping(
  variableId: string
): Promise<string | null> {
  // Ensure the ID is in the correct format (VariableID:XX:YY)
  const fullId = variableId.startsWith('VariableID:') ? variableId : `VariableID:${variableId}`;
  
  // Get all available mappings from design system tokens
  const allMappings = await getVariableMappings();
  const mapping = allMappings.find(m => m.id === fullId);
  
  return mapping ? mapping.name : null;
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