// The module 'vscode' contains the VS Code extensibility API
const {
  onDidSendMessageHandler,
} = require("./src/Services/Debuger/OnDidSendMessageHandler");
const {
  onWillReceiveMessageHandler,
} = require("./src/Services/Debuger/onWillReceiveMessageHandler");

const {
  getUniqueFilePath,
  saveNodeToDisk,
} = require("./src/Services/Debuger/utils");
const {
  fetchNodeByPosition,
  markdownOnHover,
  readVariableFromCache,
} = require("./src/Services/Hover/utils");

// Import the module and reference it with the alias vscode in your code below
const vscode = require("vscode");

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const hoverProvider = vscode.languages.registerHoverProvider(["javascript"], {
    async provideHover(document, position) {
      const block = fetchNodeByPosition({ document, position });
      const variables = await readVariableFromCache();

      const wordRange = document.getWordRangeAtPosition(position);
      if (wordRange) {
        const word = document.getText(wordRange);
        const uniqueFilePath = getUniqueFilePath(document.fileName);
        const uniqueKey = `${uniqueFilePath}.${block.scopeChain}.${word}`; // this will give us the key which will be used on the variable map we got from file

        return markdownOnHover(variables[uniqueKey]?.value);
      }
      return null;
    },
  });

  // Monitor debug sessions to capture function outputs
  vscode.debug.onDidStartDebugSession(async (session) => {
    if (session.type === "node" || session.type === "pwa-node") {
      console.log("Started debugging session: Capturing function calls...");

      const debugSessionHandler =
        vscode.debug.registerDebugAdapterTrackerFactory("*", {
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

  context.subscriptions.push(hoverProvider);
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
