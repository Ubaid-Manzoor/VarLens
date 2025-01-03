const { CACHE_FILE } = require("../config/constants");

const vscode = require("vscode");

const excludeCacheFile = () => {
  const configuration = vscode.workspace.getConfiguration();

  // Check if `.cache.json` is already excluded
  const filesExclude = configuration.get("files.exclude") || {};
  if (!filesExclude[`**/${CACHE_FILE}`]) {
    filesExclude[`**/${CACHE_FILE}`] = true;

    // Update settings.json
    configuration.update("files.exclude", filesExclude, vscode.ConfigurationTarget.Workspace).then(
      () => {
        vscode.window.showInformationMessage(`✅ '.${CACHE_FILE}' has been added to 'files.exclude' in your workspace settings.`);
      },
      (error) => {
        vscode.window.showErrorMessage(`❌ Failed to update settings: ${error.message}`);
      }
    );
  }
};

module.exports = {
  excludeCacheFile,
};
