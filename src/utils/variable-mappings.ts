/**
 * Variable mappings for known design systems
 * 
 * This file handles fetching and caching of Figma variable mappings
 * from remote sources or configuration files.
 */

import { Logger } from "~/utils/logger.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface VariableMapping {
  id: string;
  name: string;
  description?: string;
}

// Cache for fetched mappings
let cachedMappings: VariableMapping[] | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch variable mappings from a remote source
 */
async function fetchRemoteMappings(url?: string): Promise<VariableMapping[]> {
  if (!url) {
    // Check environment variable for mapping URL
    url = process.env.FIGMA_VARIABLE_MAPPINGS_URL;
    if (!url) {
      return [];
    }
  }

  try {
    Logger.log(`Fetching variable mappings from: ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      Logger.log(`Failed to fetch mappings: ${response.status}`);
      return [];
    }
    
    const data = await response.json();
    if (Array.isArray(data)) {
      return data;
    } else if (data.mappings && Array.isArray(data.mappings)) {
      return data.mappings;
    }
    
    Logger.log("Invalid mapping format from remote source");
    return [];
  } catch (error) {
    Logger.log(`Error fetching remote mappings: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/**
 * Get variable mappings from local configuration file
 */
function getLocalMappings(): VariableMapping[] {
  // Get directory path for ES modules
  let currentDir = '';
  try {
    currentDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // Fallback if import.meta.url is not available
    currentDir = process.cwd();
  }
  
  const possiblePaths = [
    // Current working directory
    path.join(process.cwd(), '.figma-variables.json'),
    // User's home directory
    path.join(process.env.HOME || '', '.figma-variables.json'),
    // Package installation directory (ES module way)
    path.join(currentDir, '..', '..', '.figma-variables.json'),
  ];

  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(content);
        
        if (config.variableMappings && Array.isArray(config.variableMappings)) {
          Logger.log(`Loaded ${config.variableMappings.length} mappings from: ${configPath}`);
          return config.variableMappings;
        }
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  Logger.log('No local variable mappings file found');
  return [];
}

/**
 * Get all variable mappings (cached)
 */
export async function getVariableMappings(): Promise<VariableMapping[]> {
  // Check cache
  if (cachedMappings && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedMappings;
  }
  
  // Fetch fresh mappings
  const mappings: VariableMapping[] = [];
  
  // 1. Try remote source first
  const remoteMappings = await fetchRemoteMappings();
  mappings.push(...remoteMappings);
  
  // 2. Add local mappings
  const localMappings = getLocalMappings();
  mappings.push(...localMappings);
  
  // Update cache
  cachedMappings = mappings;
  cacheTimestamp = Date.now();
  
  Logger.log(`Total mappings available: ${mappings.length}`);
  return mappings;
}

/**
 * Resolve a variable ID to its semantic name using mappings
 */
export async function resolveVariableFromMapping(
  variableId: string,
  customMappings?: VariableMapping[]
): Promise<string | null> {
  // Clean the variable ID (remove VariableID: prefix if present)
  const cleanId = variableId.replace('VariableID:', '');
  const fullId = variableId.startsWith('VariableID:') ? variableId : `VariableID:${variableId}`;
  
  // Check custom mappings first (if provided inline)
  if (customMappings) {
    const customMapping = customMappings.find(m => m.id === fullId || m.id === cleanId);
    if (customMapping) return customMapping.name;
  }
  
  // Get all available mappings (remote + local)
  const allMappings = await getVariableMappings();
  const mapping = allMappings.find(m => m.id === fullId || m.id === cleanId);
  if (mapping) return mapping.name;
  
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