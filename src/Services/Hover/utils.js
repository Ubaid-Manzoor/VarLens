const { CACHE_FILE } = require("../../Constants/config");

const { traverseFile } = require("../Debuger/utils");

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const fetchNodeByPosition = ({ document, position }) => {
  const nodes = traverseFile({ filePath: document.fileName });
  const lineNumber = position.line + 1;
  const block = nodes.find((node) => node.loc.start.line <= lineNumber && lineNumber <= node.loc.end.line);

  return block;
};

const readVariableFromCache = async () => {
  try {
    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const cacheFilePath = path.join(workspacePath, CACHE_FILE);
    const data = await fs.readFileSync(cacheFilePath, { encoding: "utf8" });
    return JSON.parse(data);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Failed to read the cache file:", error);
      throw error; // Rethrow unexpected errors
    }
  }
};

const markdownOnHover = (variableValue) => {
  const hoverContent = new vscode.MarkdownString();
  hoverContent.isTrusted = true; // Allows richer rendering if needed
  hoverContent.supportHtml = true; // Enable support for inline HTML (if necessary)

  hoverContent.appendMarkdown(`### VarLens\n`);
  hoverContent.appendMarkdown(
    `\n[🔍 Inspect Variable](command:extension.inspectVariable?${encodeURIComponent(JSON.stringify(variableValue))})`
  );
  hoverContent.appendCodeblock(JSON.stringify(variableValue, null, 2), "json");

  return new vscode.Hover(hoverContent);
};

module.exports = {
  fetchNodeByPosition,
  readVariableFromCache,
  markdownOnHover,
};
