# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is the Framelink Figma MCP Server - a Model Context Protocol server that gives AI-powered coding tools access to Figma design data. It's specifically designed to help AI agents like Cursor implement Figma designs accurately.

## Development Commands

### Build & Development
- `pnpm install` - Install dependencies
- `pnpm build` - Build the project (required before starting)
- `pnpm dev` - Start development server with watch mode on port 3333
- `pnpm dev:cli` - Start development server in CLI/stdio mode

### Testing & Quality
- `pnpm test` - Run Jest tests
- `pnpm type-check` - Run TypeScript type checking
- `pnpm lint` - Run ESLint
- `pnpm format` - Format code with Prettier

### Release & Publishing
- `pnpm changeset` - Add a changeset for version management
- `pnpm release` - Publish to NPM and push tags
- `pnpm inspect` - Run MCP inspector for debugging

## Architecture

### Core Structure
The project follows a modular architecture with clear separation of concerns:

- **MCP Layer** (`src/mcp/`) - Model Context Protocol server implementation
  - Tools for fetching Figma data and downloading images
  - Handles communication with AI clients via stdio or HTTP

- **Extractors** (`src/extractors/`) - Flexible system for extracting data from Figma files
  - Single-pass tree walking with composable extractors
  - Built-in extractors: layout, text, visuals, component
  - Optimized for LLM context window management

- **Transformers** (`src/transformers/`) - Convert raw Figma API data into simplified formats
  - Handles component, effects, layout, style, and text transformations

- **Services** (`src/services/figma.ts`) - Core Figma API integration

### Key Design Principles

1. **Unix Philosophy**: Tools have one job with minimal arguments to avoid confusing LLMs
2. **Single Responsibility**: Focus only on ingesting designs for AI consumption
3. **Composable Extractors**: Mix and match data extraction strategies based on needs
4. **Context Optimization**: Designed to minimize LLM context usage

### Configuration
- Server can run in stdio mode (for Cursor) or HTTP mode
- Configuration via command-line arguments or environment variables
- Figma API key required (set via `--figma-api-key` or `FIGMA_API_KEY` env var)

## Testing Approach

Tests are located in `src/tests/` and use Jest with TypeScript support. Run a single test with:
```bash
pnpm test -- --testNamePattern="test name"
```

## Important Files

- `src/cli.ts` - Entry point and server initialization
- `src/mcp/index.ts` - MCP server creation and tool registration
- `src/extractors/index.ts` - Main extractor system exports
- `src/services/figma.ts` - Figma API client implementation

## Development Notes

- Always run `pnpm build` before testing changes
- Use `pnpm dev` for local development with auto-reload
- HTTP server runs on port 3333 by default
- Respect the focused scope - avoid adding features beyond design ingestion
- Follow TypeScript strict mode and existing code patterns