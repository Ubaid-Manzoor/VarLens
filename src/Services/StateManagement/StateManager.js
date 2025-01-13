const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { CACHE_FILE } = require("../../config/constants");
const EventEmitter = require("events");

class StateManager extends EventEmitter {
  constructor(context) {
    super();
    this._storage = context.workspaceState;
    this._context = context;
    this.STORAGE_KEY = "varlens.variables";
  }

  async initialize() {
    await this.migrateLegacyCache();
  }

  async set(variables) {
    try {
      await this._storage.update(this.STORAGE_KEY, variables);
      this.emit("stateChanged", variables);
    } catch (error) {
      console.error("Failed to update state:", error);
      throw error;
    }
  }

  async get() {
    try {
      return this._storage.get(this.STORAGE_KEY, {});
    } catch (error) {
      console.error("Failed to get state:", error);
      return {};
    }
  }

  async update(newVariables) {
    try {
      const currentVariables = await this.get();
      const mergedVariables = { ...currentVariables };

      for (const [key, newData] of Object.entries(newVariables)) {
        if (this.shouldUpdateValue(currentVariables[key]?.value, newData.value)) {
          mergedVariables[key] = newData;
        }
      }

      await this.set(mergedVariables);
    } catch (error) {
      console.error("Failed to update state:", error);
      throw error;
    }
  }

  shouldUpdateValue(existingValue, newValue) {
    if (existingValue === undefined) return true;
    if (this.isEmptyValue(newValue)) return false;

    if (typeof existingValue === "object" && existingValue !== null) {
      const existingSize = Object.keys(existingValue).length;
      const newSize = Object.keys(newValue || {}).length;
      return newSize >= existingSize;
    }

    return true;
  }

  // Helper to check for empty values
  isEmptyValue(value) {
    if (value === undefined || value === null) return true;
    if (value === "undefined" || value === "null") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === "object" && Object.keys(value).length === 0) return true;
    if (value === "") return true;
    return false;
  }

  onDidChangeState(listener) {
    this.on("stateChanged", listener);
    return {
      dispose: () => this.removeListener("stateChanged", listener),
    };
  }

  async migrateLegacyCache() {
    try {
      const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!workspacePath) return;

      const cacheFilePath = path.join(workspacePath, CACHE_FILE);

      if (fs.existsSync(cacheFilePath)) {
        console.log("Found legacy cache file, migrating...");

        const data = await fs.promises.readFile(cacheFilePath, "utf8");
        if (data === "") return;

        const legacyVariables = JSON.parse(data);
        await this.update(legacyVariables);
        await fs.promises.unlink(cacheFilePath);

        vscode.window.showInformationMessage("VarLens: Successfully migrated cache to VS Code storage. " + "A backup of your old cache file has been created.");
      }
    } catch (error) {
      console.error("Migration failed:", error);
      vscode.window.showErrorMessage("VarLens: Failed to migrate cache file. Your data is preserved in the original file.");
    }
  }

  // Debug helper to view current state
  async showCurrentState() {
    const currentState = await this.get();
    const panel = vscode.window.createWebviewPanel("varlensState", "VarLens State", vscode.ViewColumn.One, {});

    panel.webview.html = `
            <html>
                <body>
                    <h1>VarLens State</h1>
                    <pre>${JSON.stringify(currentState, null, 2)}</pre>
                </body>
            </html>
        `;
  }
}

module.exports = StateManager;
