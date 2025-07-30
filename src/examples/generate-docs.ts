#!/usr/bin/env ts-node

/**
 * Example script to generate API documentation
 * Demonstrates the automatic documentation generator
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { APIDocumentationGenerator } from '../docs/api-doc-generator';
import { APISpecification } from '../types/protocol';

async function main() {
  console.log('🚀 Generating API Documentation...');

  try {
    // Load API specification
    const apiSpecPath = path.join(__dirname, '../../..', 'example-api-spec.json');
    const apiSpecContent = await fs.readFile(apiSpecPath, 'utf8');
    const apiSpec: APISpecification = JSON.parse(apiSpecContent);

    console.log(`📋 Loaded API specification: ${apiSpec.name} v${apiSpec.version}`);

    // Create documentation generator
    const generator = new APIDocumentationGenerator(apiSpec, {
      title: apiSpec.name,
      description: 'Comprehensive Janus with cross-platform support for Go, Rust, Swift, and TypeScript',
      version: apiSpec.version,
      includeExamples: true,
      includeTypes: true,
      logoUrl: '', // Optional: add your logo URL here
      customStyles: `
        /* Custom styles for your API docs */
        .sidebar-header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
        
        .badge {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
      `
    });

    // Generate documentation
    console.log('📝 Generating documentation...');
    const docs = await generator.generateDocumentation();

    // Create output directory
    const outputDir = path.join(__dirname, '../../../docs/generated');
    await fs.mkdir(outputDir, { recursive: true });

    // Save documentation files
    console.log(`💾 Saving documentation to: ${outputDir}`);
    await generator.saveToDirectory(outputDir);

    // Generate additional formats
    console.log('📄 Generating additional formats...');

    // Save OpenAPI spec separately
    await fs.writeFile(
      path.join(outputDir, 'swagger.json'),
      JSON.stringify(docs.openApiSpec, null, 2)
    );

    // Create README for the generated docs
    const readme = `# ${apiSpec.name} Documentation

This directory contains automatically generated documentation for the Janus.

## Files

- \`index.html\` - Main documentation page (open in browser)
- \`styles.css\` - Styling for the documentation
- \`script.js\` - Interactive functionality
- \`openapi.json\` - OpenAPI/Swagger specification
- \`swagger.json\` - Alternative OpenAPI specification

## Usage

1. **View Documentation**: Open \`index.html\` in a web browser
2. **API Integration**: Use \`openapi.json\` with API tools like Postman or Insomnia
3. **Development**: Import the OpenAPI spec into your development environment

## Features

- 📱 **Responsive Design**: Works on desktop and mobile
- 🔍 **Search Functionality**: Find commands and models quickly
- 📋 **Copy Examples**: Click to copy code examples
- 🎨 **Professional Styling**: Clean, modern interface
- 🔗 **Deep Linking**: Direct links to sections and commands

## Implementation Support

This API specification is implemented in multiple languages:

- **TypeScript/Node.js**: Production-ready implementation
- **Go**: High-performance server implementation  
- **Rust**: Memory-safe implementation with advanced concurrency
- **Swift**: Native macOS/iOS implementation

## Protocol

- **Transport**: Unix Domain Sockets
- **Message Format**: JSON with 4-byte length prefix
- **Security**: Comprehensive validation and sanitization
- **Async**: Full async/await support across all implementations

Generated on: ${new Date().toISOString()}
`;

    await fs.writeFile(path.join(outputDir, 'README.md'), readme);

    // Create a simple server script for local viewing
    const serverScript = `#!/usr/bin/env node

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const DOCS_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown'
};

const server = http.createServer((req, res) => {
  let pathname = url.parse(req.url).pathname;
  
  // Default to index.html
  if (pathname === '/') {
    pathname = '/index.html';
  }
  
  const filePath = path.join(DOCS_DIR, pathname);
  const ext = path.extname(filePath);
  const mimeType = MIME_TYPES[ext] || 'text/plain';
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found');
      return;
    }
    
    res.writeHead(200, { 'Content-Type': mimeType });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(\`📖 Documentation server running at http://localhost:\${PORT}\`);
  console.log(\`📁 Serving files from: \${DOCS_DIR}\`);
  console.log(\`🌐 Open http://localhost:\${PORT} in your browser\`);
});
`;

    await fs.writeFile(path.join(outputDir, 'serve.js'), serverScript);
    
    // Make serve script executable
    try {
      await fs.chmod(path.join(outputDir, 'serve.js'), 0o755);
    } catch (error) {
      // Ignore chmod errors on systems that don't support it
    }

    console.log('✅ Documentation generation complete!');
    console.log('');
    console.log('📁 Generated files:');
    console.log(`   • index.html     - Main documentation page`);
    console.log(`   • styles.css     - Styling`);
    console.log(`   • script.js      - Interactive functionality`);
    console.log(`   • openapi.json   - OpenAPI specification`);
    console.log(`   • swagger.json   - Alternative OpenAPI spec`);
    console.log(`   • README.md      - Documentation guide`);
    console.log(`   • serve.js       - Local development server`);
    console.log('');
    console.log('🚀 Next steps:');
    console.log(`   1. Open: ${outputDir}/index.html`);
    console.log(`   2. Or run: node ${outputDir}/serve.js`);
    console.log(`   3. Then visit: http://localhost:8080`);

  } catch (error) {
    console.error('❌ Error generating documentation:', error);
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}