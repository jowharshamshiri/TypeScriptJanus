/**
 * Automatic API Documentation Generator
 * Creates Swagger/OpenAPI-style documentation from Janus specifications
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { APISpecification, Command, Argument, Model } from '../types/protocol';

export interface DocumentationOptions {
  /** Title for the documentation */
  title?: string;
  
  /** Description for the documentation */
  description?: string;
  
  /** Version for the documentation */
  version?: string;
  
  /** Include interactive examples */
  includeExamples?: boolean;
  
  /** Include TypeScript type definitions */
  includeTypes?: boolean;
  
  /** Custom CSS styles */
  customStyles?: string;
  
  /** Logo URL */
  logoUrl?: string;
}

export interface GeneratedDocumentation {
  /** Generated HTML content */
  html: string;
  
  /** Generated CSS content */
  css: string;
  
  /** Generated JavaScript content */
  javascript: string;
  
  /** OpenAPI/Swagger JSON specification */
  openApiSpec: any;
}

export class APIDocumentationGenerator {
  private apiSpec: APISpecification;
  private options: Required<DocumentationOptions>;

  constructor(apiSpec: APISpecification, options: DocumentationOptions = {}) {
    this.apiSpec = apiSpec;
    this.options = {
      title: options.title ?? apiSpec.name ?? 'Janus API',
      description: options.description ?? apiSpec.description ?? 'Janus Documentation',
      version: options.version ?? apiSpec.version,
      includeExamples: options.includeExamples ?? true,
      includeTypes: options.includeTypes ?? true,
      customStyles: options.customStyles ?? '',
      logoUrl: options.logoUrl ?? ''
    };
  }

  /**
   * Generate complete documentation
   */
  async generateDocumentation(): Promise<GeneratedDocumentation> {
    const openApiSpec = this.generateOpenAPISpec();
    const html = this.generateHTML();
    const css = this.generateCSS();
    const javascript = this.generateJavaScript();

    return {
      html,
      css,
      javascript,
      openApiSpec
    };
  }

  /**
   * Generate OpenAPI/Swagger specification
   */
  generateOpenAPISpec(): any {
    const spec = {
      openapi: '3.0.3',
      info: {
        title: this.options.title,
        description: this.options.description,
        version: this.options.version,
        'x-protocol': 'unix-socket',
        'x-message-format': 'json-with-length-prefix'
      },
      servers: [
        {
          url: 'unix:/tmp/api.sock',
          description: 'Unix Domain Socket Server',
          'x-socket-path': '/tmp/api.sock'
        }
      ],
      paths: {},
      components: {
        schemas: {},
        'x-channels': {},
        'x-commands': {}
      }
    };

    // Convert channels to OpenAPI paths
    for (const [channelId, channel] of Object.entries(this.apiSpec.channels)) {
      (spec.components['x-channels'] as any)[channelId] = {
        name: channel.name,
        description: channel.description
      };

      for (const [commandName, command] of Object.entries(channel.commands)) {
        const pathKey = `/${channelId}/${commandName}`;
        
        (spec.paths as any)[pathKey] = {
          post: {
            summary: command.name,
            description: command.description,
            'x-channel': channelId,
            'x-command': commandName,
            'x-timeout': command.timeout,
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: this.generateCommandSchema(command)
                }
              }
            },
            responses: {
              '200': {
                description: 'Successful response',
                content: {
                  'application/json': {
                    schema: this.generateResponseSchema(command)
                  }
                }
              },
              'default': {
                description: 'Error response',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/ErrorResponse'
                    }
                  }
                }
              }
            }
          }
        };
      }
    }

    // Add models to schemas
    if (this.apiSpec.models) {
      for (const [modelName, model] of Object.entries(this.apiSpec.models)) {
        (spec.components.schemas as any)[modelName] = this.generateModelSchema(model);
      }
    }

    // Add standard schemas
    (spec.components.schemas as any).ErrorResponse = {
      type: 'object',
      required: ['commandId', 'channelId', 'success', 'error', 'timestamp'],
      properties: {
        commandId: { type: 'string', format: 'uuid' },
        channelId: { type: 'string' },
        success: { type: 'boolean', enum: [false] },
        error: { $ref: '#/components/schemas/Error' },
        timestamp: { type: 'string', format: 'date-time' }
      }
    };

    (spec.components.schemas as any).Error = {
      type: 'object',
      required: ['code', 'message'],
      properties: {
        code: { type: 'string' },
        message: { type: 'string' },
        details: { type: 'string' },
        field: { type: 'string' },
        value: {},
        constraints: { type: 'object' }
      }
    };

    return spec;
  }

  /**
   * Generate HTML documentation
   */
  generateHTML(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.options.title} - API Documentation</title>
    <link rel="stylesheet" href="styles.css">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/themes/prism.min.css" rel="stylesheet">
</head>
<body>
    <nav class="sidebar">
        <div class="sidebar-header">
            ${this.options.logoUrl ? `<img src="${this.options.logoUrl}" alt="Logo" class="logo">` : ''}
            <h1>${this.options.title}</h1>
            <p class="version">v${this.options.version}</p>
        </div>
        
        <div class="sidebar-content">
            <div class="nav-section">
                <h3>Overview</h3>
                <ul>
                    <li><a href="#introduction">Introduction</a></li>
                    <li><a href="#protocol">Protocol</a></li>
                    <li><a href="#authentication">Authentication</a></li>
                    <li><a href="#errors">Error Handling</a></li>
                </ul>
            </div>
            
            <div class="nav-section">
                <h3>Channels</h3>
                <ul>
                    ${Object.entries(this.apiSpec.channels).map(([channelId, channel]) => `
                        <li>
                            <a href="#channel-${channelId}">${channel.name}</a>
                            <ul class="command-list">
                                ${Object.keys(channel.commands).map(commandName => 
                                    `<li><a href="#command-${channelId}-${commandName}">${commandName}</a></li>`
                                ).join('')}
                            </ul>
                        </li>
                    `).join('')}
                </ul>
            </div>
            
            ${this.apiSpec.models ? `
            <div class="nav-section">
                <h3>Models</h3>
                <ul>
                    ${Object.keys(this.apiSpec.models).map(modelName => 
                        `<li><a href="#model-${modelName}">${modelName}</a></li>`
                    ).join('')}
                </ul>
            </div>
            ` : ''}
        </div>
    </nav>

    <main class="main-content">
        <section id="introduction" class="section">
            <h1>${this.options.title}</h1>
            <p class="lead">${this.options.description}</p>
            
            <div class="info-cards">
                <div class="info-card">
                    <h3>Protocol</h3>
                    <p>Unix Domain Sockets with JSON messaging</p>
                </div>
                <div class="info-card">
                    <h3>Version</h3>
                    <p>${this.options.version}</p>
                </div>
                <div class="info-card">
                    <h3>Channels</h3>
                    <p>${Object.keys(this.apiSpec.channels).length} available</p>
                </div>
                <div class="info-card">
                    <h3>Commands</h3>
                    <p>${Object.values(this.apiSpec.channels).reduce((total, channel) => total + Object.keys(channel.commands).length, 0)} total</p>
                </div>
            </div>
        </section>

        <section id="protocol" class="section">
            <h2>Protocol Overview</h2>
            <p>This API uses Unix Domain Sockets for inter-process communication with JSON-based messaging and 4-byte length prefixes.</p>
            
            <h3>Message Format</h3>
            <div class="code-block">
                <pre><code class="language-json">{
  "id": "uuid-v4-string",
  "channelId": "channel-identifier", 
  "command": "command-name",
  "args": {
    "key": "value"
  },
  "timeout": 30.0,
  "timestamp": "2025-07-29T10:50:00.000Z"
}</code></pre>
            </div>
            
            <h3>Response Format</h3>
            <div class="code-block">
                <pre><code class="language-json">{
  "commandId": "uuid-from-request",
  "channelId": "channel-identifier",
  "success": true,
  "result": {
    "data": "response-data"
  },
  "timestamp": "2025-07-29T10:50:01.000Z"
}</code></pre>
            </div>
        </section>

        <section id="authentication" class="section">
            <h2>Authentication</h2>
            <p>Authentication is handled through Unix socket permissions and optional channel-specific authentication mechanisms.</p>
        </section>

        <section id="errors" class="section">
            <h2>Error Handling</h2>
            <p>All errors follow a standardized format with specific error codes and detailed messages.</p>
            
            <div class="code-block">
                <pre><code class="language-json">{
  "commandId": "uuid-from-request",
  "channelId": "channel-identifier", 
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": "Additional context"
  },
  "timestamp": "2025-07-29T10:50:01.000Z"
}</code></pre>
            </div>
        </section>

        ${this.generateChannelDocumentation()}
        
        ${this.apiSpec.models ? this.generateModelDocumentation() : ''}
    </main>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/components/prism-core.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.24.1/plugins/autoloader/prism-autoloader.min.js"></script>
    <script src="script.js"></script>
</body>
</html>
    `.trim();
  }

  /**
   * Generate channel documentation
   */
  private generateChannelDocumentation(): string {
    return Object.entries(this.apiSpec.channels).map(([channelId, channel]) => `
        <section id="channel-${channelId}" class="section">
            <h2>${channel.name}</h2>
            <p>${channel.description || ''}</p>
            
            ${Object.entries(channel.commands).map(([commandName, command]) => 
                this.generateCommandDocumentation(channelId, commandName, command)
            ).join('')}
        </section>
    `).join('');
  }

  /**
   * Generate command documentation
   */
  private generateCommandDocumentation(channelId: string, commandName: string, command: Command): string {
    return `
        <div id="command-${channelId}-${commandName}" class="command">
            <h3>${command.name}</h3>
            <p>${command.description}</p>
            
            <div class="command-details">
                <div class="command-info">
                    <span class="badge">Channel: ${channelId}</span>
                    <span class="badge">Command: ${commandName}</span>
                    ${command.timeout ? `<span class="badge">Timeout: ${command.timeout}s</span>` : ''}
                </div>
                
                ${command.args ? `
                <h4>Arguments</h4>
                <div class="arguments">
                    ${Object.entries(command.args).map(([argName, arg]) => 
                        this.generateArgumentDocumentation(arg.name ?? argName, arg)
                    ).join('')}
                </div>
                ` : ''}
                
                ${command.response ? `
                <h4>Response</h4>
                <div class="response">
                    ${this.generateResponseDocumentation(command.response)}
                </div>
                ` : ''}
                
                ${command.errorCodes ? `
                <h4>Error Codes</h4>
                <div class="error-codes">
                    ${command.errorCodes.map(code => `<code class="error-code">${code}</code>`).join(' ')}
                </div>
                ` : ''}
                
                ${this.options.includeExamples ? this.generateCommandExample(channelId, commandName, command) : ''}
            </div>
        </div>
    `;
  }

  /**
   * Generate argument documentation
   */
  private generateArgumentDocumentation(_argName: string, arg: Argument): string {
    return `
        <div class="argument">
            <div class="argument-header">
                <h5>${arg.name}</h5>
                <span class="type">${arg.type}</span>
                ${arg.required ? '<span class="required">required</span>' : '<span class="optional">optional</span>'}
            </div>
            <p>${arg.description}</p>
            ${arg.default !== undefined ? `<p><strong>Default:</strong> <code>${JSON.stringify(arg.default)}</code></p>` : ''}
            ${arg.enum ? `<p><strong>Allowed values:</strong> ${arg.enum.map(v => `<code>${JSON.stringify(v)}</code>`).join(', ')}</p>` : ''}
            ${arg.pattern ? `<p><strong>Pattern:</strong> <code>${arg.pattern}</code></p>` : ''}
            ${arg.minLength !== undefined ? `<p><strong>Min length:</strong> ${arg.minLength}</p>` : ''}
            ${arg.maxLength !== undefined ? `<p><strong>Max length:</strong> ${arg.maxLength}</p>` : ''}
            ${arg.minimum !== undefined ? `<p><strong>Minimum:</strong> ${arg.minimum}</p>` : ''}
            ${arg.maximum !== undefined ? `<p><strong>Maximum:</strong> ${arg.maximum}</p>` : ''}
        </div>
    `;
  }

  /**
   * Generate response documentation
   */
  private generateResponseDocumentation(response: any): string {
    return `
        <div class="response-details">
            <p><strong>Type:</strong> ${response.type}</p>
            <p>${response.description}</p>
            ${response.modelRef ? `<p><strong>Model:</strong> <a href="#model-${response.modelRef}">${response.modelRef}</a></p>` : ''}
        </div>
    `;
  }

  /**
   * Generate command example
   */
  private generateCommandExample(channelId: string, commandName: string, command: Command): string {
    const exampleArgs: any = {};
    
    if (command.args) {
      for (const [argName, arg] of Object.entries(command.args)) {
        if (arg.default !== undefined) {
          exampleArgs[argName] = arg.default;
        } else if (arg.enum) {
          exampleArgs[argName] = arg.enum[0];
        } else {
          switch (arg.type) {
            case 'string':
              exampleArgs[argName] = `example-${argName}`;
              break;
            case 'number':
              exampleArgs[argName] = 42;
              break;
            case 'integer':
              exampleArgs[argName] = 42;
              break;
            case 'boolean':
              exampleArgs[argName] = true;
              break;
            case 'array':
              exampleArgs[argName] = ['item1', 'item2'];
              break;
            case 'object':
              exampleArgs[argName] = { key: 'value' };
              break;
          }
        }
      }
    }

    const exampleCommand = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      channelId,
      command: commandName,
      args: Object.keys(exampleArgs).length > 0 ? exampleArgs : undefined,
      timeout: command.timeout || 30.0,
      timestamp: new Date().toISOString()
    };

    const exampleResponse = {
      commandId: '550e8400-e29b-41d4-a716-446655440000',
      channelId,
      success: true,
      result: { message: 'Command executed successfully' },
      timestamp: new Date().toISOString()
    };

    return `
        <h4>Example</h4>
        <div class="example">
            <h5>Request</h5>
            <div class="code-block">
                <pre><code class="language-json">${JSON.stringify(exampleCommand, null, 2)}</code></pre>
            </div>
            
            <h5>Response</h5>
            <div class="code-block">
                <pre><code class="language-json">${JSON.stringify(exampleResponse, null, 2)}</code></pre>
            </div>
        </div>
    `;
  }

  /**
   * Generate model documentation
   */
  private generateModelDocumentation(): string {
    if (!this.apiSpec.models) return '';

    return `
        <section id="models" class="section">
            <h2>Data Models</h2>
            
            ${Object.entries(this.apiSpec.models).map(([modelName, model]) => `
                <div id="model-${modelName}" class="model">
                    <h3>${model.name}</h3>
                    <p>${model.description}</p>
                    
                    ${model.properties ? `
                    <h4>Properties</h4>
                    <div class="model-properties">
                        ${Object.entries(model.properties).map(([propName, prop]) => 
                            this.generateArgumentDocumentation(propName, prop)
                        ).join('')}
                    </div>
                    ` : ''}
                    
                    ${model.required ? `
                    <h4>Required Fields</h4>
                    <div class="required-fields">
                        ${model.required.map(field => `<code>${field}</code>`).join(', ')}
                    </div>
                    ` : ''}
                </div>
            `).join('')}
        </section>
    `;
  }

  /**
   * Generate command schema for OpenAPI
   */
  private generateCommandSchema(command: Command): any {
    const schema: any = {
      type: 'object',
      required: ['id', 'channelId', 'command', 'timestamp'],
      properties: {
        id: { type: 'string', format: 'uuid' },
        channelId: { type: 'string' },
        command: { type: 'string' },
        timestamp: { type: 'string', format: 'date-time' },
        timeout: { type: 'number', minimum: 0.1, maximum: 300.0 }
      }
    };

    if (command.args && Object.keys(command.args).length > 0) {
      schema.properties.args = {
        type: 'object',
        properties: {},
        required: []
      };

      for (const [argName, arg] of Object.entries(command.args)) {
        schema.properties.args.properties[argName] = this.generateArgumentSchema(arg);
        if (arg.required) {
          schema.properties.args.required.push(argName);
        }
      }
    }

    return schema;
  }

  /**
   * Generate response schema for OpenAPI
   */
  private generateResponseSchema(command: Command): any {
    const schema: any = {
      type: 'object',
      required: ['commandId', 'channelId', 'success', 'timestamp'],
      properties: {
        commandId: { type: 'string', format: 'uuid' },
        channelId: { type: 'string' },
        success: { type: 'boolean', enum: [true] },
        timestamp: { type: 'string', format: 'date-time' }
      }
    };

    if (command.response) {
      schema.properties.result = this.generateArgumentSchema(command.response as any);
    } else {
      schema.properties.result = { type: 'object' };
    }

    return schema;
  }

  /**
   * Generate argument schema for OpenAPI
   */
  private generateArgumentSchema(arg: Argument): any {
    const schema: any = {
      type: arg.type,
      description: arg.description
    };

    if (arg.pattern) schema.pattern = arg.pattern;
    if (arg.minLength !== undefined) schema.minLength = arg.minLength;
    if (arg.maxLength !== undefined) schema.maxLength = arg.maxLength;
    if (arg.minimum !== undefined) schema.minimum = arg.minimum;
    if (arg.maximum !== undefined) schema.maximum = arg.maximum;
    if (arg.enum) schema.enum = arg.enum;
    if (arg.default !== undefined) schema.default = arg.default;

    if (arg.type === 'array' && arg.items) {
      schema.items = this.generateArgumentSchema(arg.items);
    }

    if (arg.type === 'object') {
      if (arg.modelRef) {
        schema.$ref = `#/components/schemas/${arg.modelRef}`;
      } else if (arg.properties) {
        schema.properties = {};
        for (const [propName, prop] of Object.entries(arg.properties)) {
          schema.properties[propName] = this.generateArgumentSchema(prop);
        }
      }
    }

    return schema;
  }

  /**
   * Generate model schema for OpenAPI
   */
  private generateModelSchema(model: Model): any {
    const schema: any = {
      type: model.type,
      description: model.description
    };

    if (model.properties) {
      schema.properties = {};
      for (const [propName, prop] of Object.entries(model.properties)) {
        schema.properties[propName] = this.generateArgumentSchema(prop);
      }
    }

    if (model.required) {
      schema.required = model.required;
    }

    if (model.extends) {
      schema.allOf = [
        { $ref: `#/components/schemas/${model.extends}` },
        { type: 'object', properties: schema.properties || {} }
      ];
      delete schema.properties;
    }

    return schema;
  }

  /**
   * Generate CSS styles
   */
  generateCSS(): string {
    return `
/* Janus Documentation Styles */
* {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
}

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    line-height: 1.6;
    color: #333;
    background: #f8f9fa;
}

.sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 280px;
    height: 100vh;
    background: #2c3e50;
    color: white;
    overflow-y: auto;
    z-index: 1000;
}

.sidebar-header {
    padding: 2rem 1.5rem;
    border-bottom: 1px solid #34495e;
}

.logo {
    max-width: 60px;
    margin-bottom: 1rem;
}

.sidebar-header h1 {
    font-size: 1.5rem;
    margin-bottom: 0.5rem;
}

.version {
    color: #bdc3c7;
    font-size: 0.9rem;
}

.sidebar-content {
    padding: 1rem 0;
}

.nav-section {
    margin-bottom: 2rem;
}

.nav-section h3 {
    padding: 0 1.5rem;
    color: #ecf0f1;
    font-size: 0.9rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 1rem;
}

.nav-section ul {
    list-style: none;
}

.nav-section > ul > li > a {
    display: block;
    padding: 0.75rem 1.5rem;
    color: #bdc3c7;
    text-decoration: none;
    transition: all 0.2s;
}

.nav-section > ul > li > a:hover {
    background: #34495e;
    color: white;
}

.command-list {
    background: #34495e;
}

.command-list li a {
    display: block;
    padding: 0.5rem 2.5rem;
    color: #95a5a6;
    text-decoration: none;
    font-size: 0.9rem;
    transition: all 0.2s;
}

.command-list li a:hover {
    background: #3498db;
    color: white;
}

.main-content {
    margin-left: 280px;
    padding: 2rem;
    max-width: 1200px;
}

.section {
    background: white;
    margin-bottom: 2rem;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.section h1 {
    color: #2c3e50;
    margin-bottom: 1rem;
    font-size: 2.5rem;
}

.section h2 {
    color: #2c3e50;
    margin-bottom: 1.5rem;
    font-size: 2rem;
    border-bottom: 2px solid #ecf0f1;
    padding-bottom: 0.5rem;
}

.section h3 {
    color: #34495e;
    margin: 2rem 0 1rem 0;
    font-size: 1.5rem;
}

.section h4 {
    color: #7f8c8d;
    margin: 1.5rem 0 1rem 0;
    font-size: 1.2rem;
}

.section h5 {
    color: #95a5a6;
    margin: 1rem 0 0.5rem 0;
    font-size: 1rem;
}

.lead {
    font-size: 1.2rem;
    color: #7f8c8d;
    margin-bottom: 2rem;
}

.info-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin: 2rem 0;
}

.info-card {
    background: #ecf0f1;
    padding: 1.5rem;
    border-radius: 6px;
    text-align: center;
}

.info-card h3 {
    color: #2c3e50;
    margin-bottom: 0.5rem;
    font-size: 1rem;
}

.info-card p {
    color: #7f8c8d;
    font-weight: 600;
}

.code-block {
    background: #2c3e50;
    border-radius: 6px;
    margin: 1rem 0;
    overflow-x: auto;
}

.code-block pre {
    padding: 1.5rem;
    margin: 0;
    color: #ecf0f1;
}

.command {
    border: 1px solid #ecf0f1;
    border-radius: 6px;
    margin: 1.5rem 0;
    padding: 1.5rem;
    background: #fdfdfd;
}

.command-details {
    margin-top: 1rem;
}

.command-info {
    margin-bottom: 1rem;
}

.badge {
    background: #3498db;
    color: white;
    padding: 0.25rem 0.75rem;
    border-radius: 4px;
    font-size: 0.8rem;
    margin-right: 0.5rem;
    display: inline-block;
}

.arguments, .model-properties {
    border-left: 3px solid #3498db;
    padding-left: 1rem;
    margin: 1rem 0;
}

.argument, .model {
    border: 1px solid #ecf0f1;
    border-radius: 4px;
    padding: 1rem;
    margin: 0.5rem 0;
    background: white;
}

.argument-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.5rem;
}

.argument-header h5 {
    margin: 0;
    color: #2c3e50;
}

.type {
    background: #95a5a6;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    font-size: 0.8rem;
    font-family: monospace;
}

.required {
    background: #e74c3c;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    font-size: 0.8rem;
}

.optional {
    background: #f39c12;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    font-size: 0.8rem;
}

.error-codes {
    margin: 1rem 0;
}

.error-code {
    background: #e74c3c;
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-size: 0.9rem;
    margin-right: 0.5rem;
    display: inline-block;
    margin-bottom: 0.5rem;
}

.example {
    background: #f8f9fa;
    border: 1px solid #ecf0f1;
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem 0;
}

.required-fields {
    margin: 1rem 0;
}

.required-fields code {
    background: #e74c3c;
    color: white;
    padding: 0.2rem 0.5rem;
    border-radius: 3px;
    margin-right: 0.5rem;
}

/* Responsive design */
@media (max-width: 768px) {
    .sidebar {
        transform: translateX(-100%);
        transition: transform 0.3s;
    }
    
    .sidebar.open {
        transform: translateX(0);
    }
    
    .main-content {
        margin-left: 0;
        padding: 1rem;
    }
}

/* Custom styles placeholder */
${this.options.customStyles}
    `.trim();
  }

  /**
   * Generate JavaScript functionality
   */
  generateJavaScript(): string {
    return `
// Janus Documentation JavaScript

document.addEventListener('DOMContentLoaded', function() {
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Highlight current section in navigation
    const observerOptions = {
        rootMargin: '-20% 0px -70% 0px',
        threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                // Remove active class from all nav links
                document.querySelectorAll('.sidebar a').forEach(link => {
                    link.classList.remove('active');
                });
                
                // Add active class to corresponding nav link
                const id = entry.target.id;
                const navLink = document.querySelector(\`a[href="#\${id}"]\`);
                if (navLink) {
                    navLink.classList.add('active');
                }
            }
        });
    }, observerOptions);

    // Observe all sections and commands
    document.querySelectorAll('.section, .command').forEach(section => {
        if (section.id) {
            observer.observe(section);
        }
    });

    // Copy code blocks to clipboard
    document.querySelectorAll('.code-block').forEach(block => {
        const button = document.createElement('button');
        button.className = 'copy-button';
        button.textContent = 'Copy';
        button.style.cssText = \`
            position: absolute;
            top: 1rem;
            right: 1rem;
            background: #3498db;
            color: white;
            border: none;
            padding: 0.5rem 1rem;
            border-radius: 4px;
            cursor: pointer;
            font-size: 0.8rem;
        \`;
        
        block.style.position = 'relative';
        block.appendChild(button);
        
        button.addEventListener('click', async () => {
            const code = block.querySelector('code').textContent;
            try {
                await navigator.clipboard.writeText(code);
                button.textContent = 'Copied!';
                setTimeout(() => {
                    button.textContent = 'Copy';
                }, 2000);
            } catch (err) {
                console.error('Failed to copy code:', err);
            }
        });
    });

    // Mobile menu toggle
    const createMobileToggle = () => {
        const toggle = document.createElement('button');
        toggle.className = 'mobile-toggle';
        toggle.innerHTML = '☰';
        toggle.style.cssText = \`
            position: fixed;
            top: 1rem;
            left: 1rem;
            z-index: 1001;
            background: #2c3e50;
            color: white;
            border: none;
            padding: 0.75rem;
            border-radius: 6px;
            font-size: 1.2rem;
            cursor: pointer;
            display: none;
        \`;
        
        document.body.appendChild(toggle);
        
        toggle.addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
        });
        
        // Show/hide mobile toggle based on screen size
        const checkMobile = () => {
            if (window.innerWidth <= 768) {
                toggle.style.display = 'block';
            } else {
                toggle.style.display = 'none';
                document.querySelector('.sidebar').classList.remove('open');
            }
        };
        
        window.addEventListener('resize', checkMobile);
        checkMobile();
    };
    
    createMobileToggle();

    // Search functionality
    const createSearch = () => {
        const searchContainer = document.createElement('div');
        searchContainer.style.cssText = \`
            padding: 1rem 1.5rem;
            border-bottom: 1px solid #34495e;
        \`;
        
        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search commands...';
        searchInput.style.cssText = \`
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #34495e;
            border-radius: 4px;
            background: #34495e;
            color: white;
            font-size: 0.9rem;
        \`;
        
        searchInput.style.setProperty('::placeholder', 'color: #bdc3c7');
        
        searchContainer.appendChild(searchInput);
        
        const sidebarHeader = document.querySelector('.sidebar-header');
        sidebarHeader.parentNode.insertBefore(searchContainer, sidebarHeader.nextSibling);
        
        // Search functionality
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const navLinks = document.querySelectorAll('.sidebar a');
            
            navLinks.forEach(link => {
                const text = link.textContent.toLowerCase();
                const listItem = link.closest('li');
                
                if (text.includes(query) || query === '') {
                    listItem.style.display = 'block';
                } else {
                    listItem.style.display = 'none';
                }
            });
        });
    };
    
    createSearch();
});
    `.trim();
  }

  /**
   * Save documentation to files
   */
  async saveToDirectory(outputDir: string): Promise<void> {
    const docs = await this.generateDocumentation();
    
    // Ensure output directory exists
    await fs.mkdir(outputDir, { recursive: true });
    
    // Write files
    await fs.writeFile(path.join(outputDir, 'index.html'), docs.html);
    await fs.writeFile(path.join(outputDir, 'styles.css'), docs.css);
    await fs.writeFile(path.join(outputDir, 'script.js'), docs.javascript);
    await fs.writeFile(path.join(outputDir, 'openapi.json'), JSON.stringify(docs.openApiSpec, null, 2));
  }
}