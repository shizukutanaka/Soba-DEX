const express = require('express');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');

class DocumentationServer {
  constructor() {
    this.app = express();
    this.port = process.env.DOCS_PORT || 3001;
    this.docsDir = path.join(__dirname, '../docs');

    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    // Enable CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header(
        'Access-Control-Allow-Headers',
        'Origin, X-Requested-With, Content-Type, Accept'
      );
      next();
    });

    // Serve static files from docs directory
    this.app.use('/static', express.static(this.docsDir));
  }

  setupRoutes() {
    // Home page with documentation index
    this.app.get('/', (req, res) => {
      const indexHtml = this.generateIndexPage();
      res.send(indexHtml);
    });

    // Swagger UI for API documentation
    this.app.get('/api-docs', (req, res, next) => {
      const swaggerPath = path.join(this.docsDir, 'swagger.json');

      if (!fs.existsSync(swaggerPath)) {
        return res.status(404).send(`
          <h1>API Documentation Not Found</h1>
          <p>Please generate the documentation first by running:</p>
          <code>npm run docs:generate</code>
          <p><a href="/">← Back to Documentation Index</a></p>
        `);
      }

      try {
        const swaggerDocument = JSON.parse(
          fs.readFileSync(swaggerPath, 'utf8')
        );
        swaggerUi.setup(swaggerDocument, {
          customCss: '.swagger-ui .topbar { display: none }',
          customSiteTitle: 'DEX Platform API Documentation',
        })(req, res, next);
      } catch (error) {
        res.status(500).send(`
          <h1>Error Loading API Documentation</h1>
          <p>Error: ${error.message}</p>
          <p><a href="/">← Back to Documentation Index</a></p>
        `);
      }
    });

    this.app.use('/api-docs', swaggerUi.serve);

    // Markdown documentation viewer
    this.app.get('/docs/:docName', (req, res) => {
      const { docName } = req.params;
      const docPath = path.join(this.docsDir, `${docName}.md`);

      if (!fs.existsSync(docPath)) {
        return res.status(404).send(`
          <h1>Document Not Found</h1>
          <p>The document "${docName}.md" was not found.</p>
          <p><a href="/">← Back to Documentation Index</a></p>
        `);
      }

      try {
        const markdownContent = fs.readFileSync(docPath, 'utf8');
        const htmlContent = this.markdownToHtml(markdownContent, docName);
        res.send(htmlContent);
      } catch (error) {
        res.status(500).send(`
          <h1>Error Loading Document</h1>
          <p>Error: ${error.message}</p>
          <p><a href="/">← Back to Documentation Index</a></p>
        `);
      }
    });

    // JSON files (swagger spec, postman collection)
    this.app.get('/json/:fileName', (req, res) => {
      const { fileName } = req.params;
      const filePath = path.join(this.docsDir, fileName);

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' });
      }

      try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const jsonContent = JSON.parse(fileContent);
        res.json(jsonContent);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Health check for docs server
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        docsGenerated: this.checkDocsAvailability(),
      });
    });
  }

  generateIndexPage() {
    const docsAvailable = this.checkDocsAvailability();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>DEX Platform Documentation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        .header {
            text-align: center;
            margin-bottom: 40px;
            padding: 40px 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border-radius: 10px;
        }
        .docs-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .doc-card {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            background: white;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            transition: transform 0.2s;
        }
        .doc-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 8px rgba(0,0,0,0.15);
        }
        .doc-card h3 {
            margin-top: 0;
            color: #667eea;
        }
        .doc-link {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 10px 20px;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 10px;
        }
        .doc-link:hover {
            background: #5a67d8;
        }
        .status {
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .status.available {
            background: #f0fff4;
            border: 1px solid #9ae6b4;
            color: #276749;
        }
        .status.unavailable {
            background: #fff5f5;
            border: 1px solid #feb2b2;
            color: #742a2a;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #eee;
            color: #666;
        }
        .generate-btn {
            background: #38a169;
            color: white;
            padding: 12px 24px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
        }
        .generate-btn:hover {
            background: #2f855a;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>DEX Platform Documentation</h1>
        <p>Comprehensive API and system documentation</p>
    </div>

    <div class="status ${docsAvailable.hasAnyDocs ? 'available' : 'unavailable'}">
        ${
          docsAvailable.hasAnyDocs
            ? '✅ Documentation is available and ready to use!'
            : '⚠️ Documentation not found. Please generate documentation first.'
        }
        ${!docsAvailable.hasAnyDocs ? '<br><button class="generate-btn" onclick="generateDocs()">Generate Documentation</button>' : ''}
    </div>

    <div class="docs-grid">
        <div class="doc-card">
            <h3>📊 Interactive API Documentation</h3>
            <p>Browse and test API endpoints with Swagger UI. Includes request/response examples and interactive testing.</p>
            <a href="/api-docs" class="doc-link">View API Docs</a>
        </div>

        <div class="doc-card">
            <h3>📖 API Reference</h3>
            <p>Complete API reference in Markdown format with detailed descriptions and examples.</p>
            <a href="/docs/API" class="doc-link">View API Reference</a>
        </div>

        <div class="doc-card">
            <h3>🔐 Security Documentation</h3>
            <p>Security features, threat protection, and best practices for the DEX platform.</p>
            <a href="/docs/SECURITY" class="doc-link">View Security Docs</a>
        </div>

        <div class="doc-card">
            <h3>📥 Postman Collection</h3>
            <p>Download and import the Postman collection for easy API testing and development.</p>
            <a href="/json/postman-collection.json" class="doc-link">Download Collection</a>
        </div>

        <div class="doc-card">
            <h3>🔧 OpenAPI Specification</h3>
            <p>Raw OpenAPI/Swagger specification file for integration with tools and frameworks.</p>
            <a href="/json/swagger.json" class="doc-link">Download Spec</a>
        </div>

        <div class="doc-card">
            <h3>💾 Server Health</h3>
            <p>Check the status of the documentation server and available resources.</p>
            <a href="/health" class="doc-link">Check Health</a>
        </div>
    </div>

    <div class="footer">
        <p>Documentation served on port ${this.port} | Generated: ${new Date().toLocaleString()}</p>
        <p>To regenerate documentation: <code>npm run docs:generate</code></p>
    </div>

    <script>
        function generateDocs() {
            alert('Please run "npm run docs:generate" from the backend directory to generate documentation.');
        }
    </script>
</body>
</html>`;
  }

  markdownToHtml(markdown, title) {
    // Simple markdown to HTML conversion
    let html = markdown
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^#### (.*$)/gim, '<h4>$1</h4>')
      .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*)\*/gim, '<em>$1</em>')
      .replace(/`([^`]+)`/gim, '<code>$1</code>')
      .replace(/```([^`]+)```/gim, '<pre><code>$1</code></pre>')
      .replace(/\n/gim, '<br>');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - DEX Platform Documentation</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
            color: #333;
        }
        h1, h2, h3, h4 { color: #667eea; }
        code {
            background: #f4f4f4;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'Monaco', 'Consolas', monospace;
        }
        pre {
            background: #f4f4f4;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
        .back-link {
            display: inline-block;
            background: #667eea;
            color: white;
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 4px;
            margin-bottom: 20px;
        }
        .back-link:hover {
            background: #5a67d8;
        }
    </style>
</head>
<body>
    <a href="/" class="back-link">← Back to Documentation Index</a>
    <div class="content">
        ${html}
    </div>
</body>
</html>`;
  }

  checkDocsAvailability() {
    const files = [
      'swagger.json',
      'API.md',
      'SECURITY.md',
      'postman-collection.json',
    ];
    const availability = {};

    files.forEach(file => {
      availability[file] = fs.existsSync(path.join(this.docsDir, file));
    });

    availability.hasAnyDocs = Object.values(availability).some(Boolean);
    return availability;
  }

  start() {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(this.port, () => {
          console.log(`📚 Documentation server started on port ${this.port}`);
          console.log(
            `🌐 Access documentation at: http://localhost:${this.port}`
          );
          console.log(
            `📊 API documentation: http://localhost:${this.port}/api-docs`
          );
          console.log(`🔍 Server health: http://localhost:${this.port}/health`);
          resolve(this.server);
        });

        this.server.on('error', error => {
          if (error.code === 'EADDRINUSE') {
            console.error(`❌ Port ${this.port} is already in use`);
            console.log(
              `💡 Try setting a different port: DOCS_PORT=3002 npm run docs:serve`
            );
          } else {
            console.error('❌ Server error:', error.message);
          }
          reject(error);
        });
      } catch (error) {
        console.error(
          '❌ Failed to start documentation server:',
          error.message
        );
        reject(error);
      }
    });
  }

  stop() {
    return new Promise(resolve => {
      if (this.server) {
        this.server.close(() => {
          console.log('📚 Documentation server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  if (global.docsServer) {
    await global.docsServer.stop();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, shutting down gracefully...');
  if (global.docsServer) {
    await global.docsServer.stop();
  }
  process.exit(0);
});

// Start server if this file is run directly
if (require.main === module) {
  const docsServer = new DocumentationServer();
  global.docsServer = docsServer;

  docsServer.start().catch(error => {
    console.error('Failed to start documentation server:', error);
    process.exit(1);
  });
}

module.exports = DocumentationServer;
