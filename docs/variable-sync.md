# Figma Variable Synchronization

## How Variable Resolution Works

The MCP server resolves Figma variable IDs to semantic names using a mapping system that supports multiple sources:

### 1. Automatic Refresh Intervals

- **Local file (`.figma-variables.json`)**: Checked every 10 seconds for changes
- **Remote URL**: Cached for 5 minutes, then refetched
- **File modification detection**: Automatically reloads if the file timestamp changes

### 2. Configuration Sources (checked in order)

1. Current working directory (`.figma-variables.json`)
2. Home directory (`~/.figma-variables.json`)
3. Package installation directory
4. Remote URL (via `FIGMA_VARIABLE_MAPPINGS_URL` environment variable)

## Keeping Variables in Sync

### Option 1: Manual Sync Script (Recommended)

If you have access to the Figma library file containing the variables:

```bash
# Set environment variables
export FIGMA_API_KEY="your-figma-api-key"
export FIGMA_LIBRARY_FILE_KEY="your-library-file-key"

# Run the sync script
node scripts/sync-figma-variables.mjs
```

This will:
- Fetch all variables from the library file
- Generate a `.figma-variables.json` with proper mappings
- Include metadata like `lastSynced` timestamp

### Option 2: Automated Sync with Cron

Set up a cron job to sync variables periodically:

```bash
# Add to crontab (runs every hour)
0 * * * * cd /path/to/project && FIGMA_API_KEY=xxx FIGMA_LIBRARY_FILE_KEY=xxx node scripts/sync-figma-variables.mjs
```

### Option 3: CI/CD Integration

Add to your CI pipeline to sync on every deployment:

```yaml
# GitHub Actions example
- name: Sync Figma Variables
  env:
    FIGMA_API_KEY: ${{ secrets.FIGMA_API_KEY }}
    FIGMA_LIBRARY_FILE_KEY: ${{ secrets.FIGMA_LIBRARY_FILE_KEY }}
  run: node scripts/sync-figma-variables.mjs
```

### Option 4: Remote URL with Auto-Update

Host your mappings on a CDN or API endpoint:

```bash
export FIGMA_VARIABLE_MAPPINGS_URL="https://your-cdn.com/figma-variables.json"
```

Update the remote file whenever designers make changes, and the MCP server will fetch the latest version every 5 minutes.

## Manual Configuration

If you can't access the library file, create `.figma-variables.json` manually:

```json
{
  "lastSynced": "2024-01-10T10:00:00Z",
  "variableMappings": [
    {
      "id": "VariableID:50:7",
      "name": "Surface/Inverse",
      "description": "Inverse surface color"
    },
    {
      "id": "VariableID:54:2",
      "name": "Content/Inverse",
      "description": "Inverse content color"
    }
  ]
}
```

## Finding Variable IDs

To find the variable IDs used in your design:

1. Run the MCP server without mappings
2. Look for `Variable[XX:YY]` in the output
3. Add mappings for these IDs to your config file

Example output before mapping:
```yaml
fill_ABC123:
  - value: '#FCFFFA'
    variable: Variable[50:7]  # <-- This needs mapping
```

After adding mapping:
```yaml
fill_ABC123:
  - value: '#FCFFFA'
    variable: Surface/Inverse
    variableId: VariableID:50:7
```

## Troubleshooting

### Variables not resolving?

1. Check if the config file is being loaded:
   - Look for "Loaded X mappings from:" in the logs
   - Verify file permissions

2. Ensure variable IDs match exactly:
   - Format should be `VariableID:XX:YY`
   - IDs are case-sensitive

3. For library variables:
   - You need access to the library file
   - Personal access tokens may not have sufficient permissions
   - Try OAuth tokens with `file_variables:read` scope

### Performance considerations

- Local file is checked every 10 seconds (minimal overhead)
- Remote URL is cached for 5 minutes
- File modification time is tracked to avoid unnecessary re-parsing
- Mappings are cached in memory between requests