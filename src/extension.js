const { inspectVariableCommandHandler } = require("./services/commands/inspectVariableHandler.js");
const { hoverHandler } = require("./services/hover/handler.js");
const { CACHE_FILE } = require("./config/constants.js");
const { excludeCacheFile } = require("./services/utils.js");
const { debugHandler } = require("./services/debug/handler.js");
const { readVariableFromCache } = require("./services/hover/utils.js");

const vscode = require("vscode");

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  excludeCacheFile();

  let cachedVariables = null;

  // Initial cache load when VS Code starts
  readVariableFromCache()
    .then((variables) => {
      cachedVariables = variables;
    })
    .catch((error) => {
      console.error("Failed to load initial cache:", error);
    });

  // Watch for file changes
  const cacheFileWatcher = vscode.workspace.createFileSystemWatcher(`**/${CACHE_FILE}`);
  cacheFileWatcher.onDidChange(async () => {
    cachedVariables = await readVariableFromCache();
  });

  const hoverProvider = vscode.languages.registerHoverProvider(["javascript", "typescript"], {
    async provideHover(document, position) {
      return await hoverHandler({ document, position, cachedVariables });
    },
  });
  context.subscriptions.push(hoverProvider);

  // Monitor debug sessions to capture function outputs
  vscode.debug.onDidStartDebugSession(async (session) => {
    debugHandler(session);
  });

  // Register the command that gets triggered on click
  const inspectVariableCommand = vscode.commands.registerCommand("extension.inspectVariable", async (variableValue) => {
    inspectVariableCommandHandler({ variableValue });
  });

  context.subscriptions.push(inspectVariableCommand);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
