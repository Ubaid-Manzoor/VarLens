const { getCompleteVariable, getUniqueFilePath, traverseFile, saveNodeToDisk } = require("./utils.js");

const vscode = require("vscode");

const debugHandler = ({ session, context, stateManager }) => {
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
            await saveNodeToDisk(nodesPerFile, stateManager);
            console.log("Stop Session");
          },
        };
      },
    });
    context.subscriptions.push(debugSessionHandler);
  }
};

const onDidSendMessageHandler = async ({ message, currentStackTrace, currentScope, currentVariables, nodesPerFile }) => {
  try {
    if (message.type === "response") {
      if (message.command === "stackTrace" && message.success) {
        const machingStackTrace = currentStackTrace.find((t) => t.request.seq === message.request_seq);
        machingStackTrace.response = structuredClone(message);
      } else if (message.command === "scopes" && message.success) {
        const machingScope = currentScope.find((t) => t.request.seq === message.request_seq);
        machingScope.response = structuredClone(message);

        const allScopes = machingScope.response.body.scopes ?? [];
        for (const scope of allScopes) {
          if (scope.name === "Global" || scope.name === "Local") continue;
          const alreadyRequested = currentVariables.some((v) => v.request.arguments.variablesReference === scope.variablesReference);

          if (!alreadyRequested) {
            await vscode.debug.activeDebugSession.customRequest("variables", {
              variablesReference: scope.variablesReference,
            });
            break; // This is just to stop at the first scope request.
          }
        }
      } else if (message.command === "variables" && message.success) {
        const machingVariables = currentVariables.find((t) => t.request.seq === message.request_seq);
        if (!machingVariables) return;
        machingVariables.response = structuredClone(message);

        // For variables that are objects, get their complete structure
        const currentBlockVariables = machingVariables?.response?.body?.variables ?? [];
        for (const variable of currentBlockVariables) {
          if (variable.type === "global" || variable.name === "this") continue;
          const frameId = currentStackTrace[0].response.body.stackFrames[0].id;
          if (variable.value === "undefined" || variable.value === undefined) continue;
          const completeValue = await getCompleteVariable(vscode.debug.activeDebugSession, variable.name, variable.type, frameId);
          if (completeValue) {
            variable.value = completeValue;
          }
        }
      }
    } else if (message.type === "event") {
      if (message.event === "continued") {
        if (currentStackTrace.length > 0) {
          try {
            const uniqueFilePath = getUniqueFilePath(currentStackTrace[0].response.body.stackFrames[0].source.path);
            if (!nodesPerFile[uniqueFilePath]) {
              const nodes = traverseFile({
                filePath: currentStackTrace[0].response.body.stackFrames[0].source.path,
              });
              nodesPerFile[uniqueFilePath] = nodes;
            }

            const lineNumber = currentStackTrace[0].response.body.stackFrames[0].line;
            const block = nodesPerFile[uniqueFilePath].find((node) => node.loc.start.line <= lineNumber && lineNumber <= node.loc.end.line);
            const LocalVariables = currentVariables.find((v) => v.request.arguments.variablesReference === currentScope[0].response.body.scopes[0].variablesReference).response.body.variables;
            block.variables = structuredClone(LocalVariables);

            const params = block.params ?? [];
            for (const param of params) {
              if (LocalVariables.some((v) => v.name === param.name)) return;
              const functionClosureVariable = currentVariables.find(
                (v) => v.request.arguments.variablesReference === currentScope[0].response.body.scopes[1].variablesReference && currentScope[0].response.body.scopes[1].name === `Closure (${block.nodeName})`
              ).response.body.variables;

              const variable = functionClosureVariable.find((v) => v.name === param.name);
              if (variable) block.variables.push(variable);
            }

            currentStackTrace.length = 0;
            currentScope.length = 0;
            currentVariables.length = 0;
          } catch (error) {
            console.log(error);
          }
        }
      }
    }
  } catch (error) {
    console.error("Error handling debug message:", error);
  }
};

const onWillReceiveMessageHandler = ({ message, currentScope, currentStackTrace, currentVariables }) => {
  if (message.type === "request") {
    if (message.command === "stackTrace") {
      currentStackTrace.push({ request: message });
    } else if (message.command === "scopes") {
      currentScope.push({ request: message });
    } else if (message.command === "variables") {
      if (currentVariables.some((v) => v.request.arguments.variablesReference === message.arguments.variablesReference)) return;
      currentVariables.push({ request: message });
    }
  }
};

module.exports = {
  debugHandler,
  onWillReceiveMessageHandler,
  onDidSendMessageHandler,
};
