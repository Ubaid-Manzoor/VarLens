const { excludeCacheFile } = require("./src/Services/utils");

// The module 'vscode' contains the VS Code extensibility API
const { onDidSendMessageHandler } = require("./src/Services/Debuger/OnDidSendMessageHandler");
const { onWillReceiveMessageHandler } = require("./src/Services/Debuger/onWillReceiveMessageHandler");

const { getUniqueFilePath, saveNodeToDisk } = require("./src/Services/Debuger/utils");
const { fetchNodeByPosition, markdownOnHover, readVariableFromCache } = require("./src/Services/Hover/utils");

// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  excludeCacheFile();
  const hoverProvider = vscode.languages.registerHoverProvider(["javascript", "typescript"], {
    async provideHover(document, position) {
      const block = fetchNodeByPosition({ document, position });
      const variables = await readVariableFromCache();
      const wordRange = document.getWordRangeAtPosition(position);
      if (wordRange) {
        const word = document.getText(wordRange);
        const uniqueFilePath = getUniqueFilePath(document.fileName);
        const uniqueKey = `${uniqueFilePath}.${block.scopeChain}.${word}`.replace(/\.{2,}/g, ".");
        return markdownOnHover(variables[uniqueKey]?.value);
      }
      return null;
    },
  });
  context.subscriptions.push(hoverProvider);

  // Monitor debug sessions to capture function outputs
  vscode.debug.onDidStartDebugSession(async (session) => {
    if (session.type === "node" || session.type === "pwa-node") {
      vscode.window.showInformationMessage("VarLen is watching you debug session...");
      const debugSessionHandler = vscode.debug.registerDebugAdapterTrackerFactory("*", {
        createDebugAdapterTracker() {
          let currentStackTrace = [];
          let currentScope = [];
          let currentVariables = [];
          let nodesPerFile = {};
          return {
            onWillReceiveMessage(message) {
              onWillReceiveMessageHandler({
                message,
                currentScope,
                currentStackTrace,
                currentVariables,
              });
            },
            async onDidSendMessage(message) {
              await onDidSendMessageHandler({
                message,
                currentScope,
                currentStackTrace,
                currentVariables,
                nodesPerFile,
              });
            },
            onError(error) {
              console.error("Debug adapter error:", error);
            },
            onExit(code, signal) {
              console.log("Debug adapter exit:", code, signal);
            },
            async onWillStopSession() {
              await saveNodeToDisk(nodesPerFile);
              console.log("Stop Session");
            },
          };
        },
      });
      context.subscriptions.push(debugSessionHandler);
    }
  });

  // Register the command that gets triggered on click
  const inspectVariableCommand = vscode.commands.registerCommand("extension.inspectVariable", async (variableValue) => {
    try {
      const panel = vscode.window.createWebviewPanel(
        "inspectVariable", // Identifier
        "Inspect Variable", // Title
        vscode.ViewColumn.Beside, // Open beside the current editor
        {
          enableScripts: true, // Enable JavaScript in the webview
        }
      );

      // Send JSON data to the webview
      const jsonData = JSON.stringify(variableValue, null, 2);

      panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Inspect Variable</title>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.2/jsoneditor.min.css">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.2/jsoneditor.min.js"></script>
        <style>
          body {
            margin: 0;
            font-family: Arial, sans-serif;
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          #jsoneditor {
            flex-grow: 1;
            border: 1px solid #ddd;
          }
        </style>
      </head>
      <body>
        <h2>VarLens</h2>
        <div id="jsoneditor"></div>
        <script>
          const container = document.getElementById("jsoneditor");
          const options = {
            mode: "view", // View-only mode
            mainMenuBar: true, // Enable main menu
            statusBar: true, // Enable status bar
            onError: function (err) {
              alert(err.toString());
            }
          };
          const editor = new JSONEditor(container, options);
          const json = ${jsonData};
          editor.set(json);
        </script>
      </body>
      </html>
    `;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to inspect variable: ${error.message}`);
    }
  });

  context.subscriptions.push(inspectVariableCommand);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
