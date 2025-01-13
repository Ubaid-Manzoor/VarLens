const StateManager = require("./services/StateManagement/StateManager.js");

const { inspectVariableCommandHandler } = require("./services/commands/inspectVariableHandler.js");
const { hoverHandler } = require("./services/hover/handler.js");
const { debugHandler } = require("./services/debug/handler.js");

const vscode = require("vscode");

function activate(context) {
  const stateManager = new StateManager(context);
  let cachedVariables = null;
  stateManager.get().then((variables) => {
    cachedVariables = variables;
    console.log("Initial state loaded");
  });

  // Migrate legacy cache if needed
  stateManager.initialize().catch((error) => console.error("Failed to initialize state manager:", error));
  const debugCommand = vscode.commands.registerCommand("varlens.showState", () => stateManager.showCurrentState());

  const hoverProvider = vscode.languages.registerHoverProvider(["javascript", "typescript"], {
    async provideHover(document, position) {
      return await hoverHandler({
        document,
        position,
        cachedVariables,
        stateManager,
      });
    },
  });

  vscode.debug.onDidStartDebugSession(async (session) => await debugHandler({ session, context, stateManager }));
  const inspectVariableCommand = vscode.commands.registerCommand("varlens.inspectVariable", async (variableValue) => await inspectVariableCommandHandler({ variableValue }));

  context.subscriptions.push(debugCommand);
  context.subscriptions.push(hoverProvider);
  context.subscriptions.push(inspectVariableCommand);
  context.subscriptions.push(
    stateManager.onDidChangeState(async (newState) => {
      cachedVariables = newState;
    })
  );
}

// This method is called when your extension is deactivated
function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
