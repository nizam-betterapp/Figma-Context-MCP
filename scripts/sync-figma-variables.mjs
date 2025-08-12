#!/usr/bin/env node

/**
 * Script to sync Figma variables from a library file
 * This requires access to the library file containing the variables
 */

import https from 'https';
import fs from 'fs';
import path from 'path';

const FIGMA_API_KEY = process.env.FIGMA_API_KEY;
const LIBRARY_FILE_KEY = process.env.FIGMA_LIBRARY_FILE_KEY; // The file containing the variables

if (!FIGMA_API_KEY || !LIBRARY_FILE_KEY) {
  console.error('Please set FIGMA_API_KEY and FIGMA_LIBRARY_FILE_KEY environment variables');
  process.exit(1);
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.figma.com',
      path: `/v1${path}`,
      method: 'GET',
      headers: {
        'X-Figma-Token': FIGMA_API_KEY
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function syncVariables() {
  console.log('Fetching variables from Figma library...');
  
  try {
    // Try to fetch local variables from the library file
    const response = await makeRequest(`/files/${LIBRARY_FILE_KEY}/variables/local`);
    
    if (response.error) {
      console.error('Error fetching variables:', response.error);
      return;
    }
    
    const variables = response.meta?.variables || {};
    const collections = response.meta?.variableCollections || {};
    
    console.log(`Found ${Object.keys(variables).length} variables`);
    
    // Build mappings
    const mappings = [];
    
    for (const [id, variable] of Object.entries(variables)) {
      let name = variable.name;
      
      // Add collection name if available
      if (variable.variableCollectionId && collections[variable.variableCollectionId]) {
        const collection = collections[variable.variableCollectionId];
        name = `${collection.name}/${name}`;
      }
      
      mappings.push({
        id: `VariableID:${id}`,
        name: name,
        description: variable.description || '',
        resolvedType: variable.resolvedType,
        // Include the actual value for reference
        value: variable.valuesByMode ? Object.values(variable.valuesByMode)[0] : null
      });
    }
    
    // Sort by name for consistency
    mappings.sort((a, b) => a.name.localeCompare(b.name));
    
    // Write to file
    const output = {
      lastSynced: new Date().toISOString(),
      sourceFile: LIBRARY_FILE_KEY,
      variableMappings: mappings
    };
    
    const outputPath = path.join(process.cwd(), '.figma-variables.json');
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
    
    console.log(`✅ Synced ${mappings.length} variables to ${outputPath}`);
    
    // Show sample mappings
    console.log('\nSample mappings:');
    mappings.slice(0, 5).forEach(m => {
      console.log(`  ${m.name}: ${m.id}`);
    });
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

syncVariables();