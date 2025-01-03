const { getUniqueFilePath } = require("../debug/utils");
const { fetchNodeByPosition, markdownOnHover, readVariableFromCache } = require("./utils");

const hoverHandler = async ({ document, position, cachedVariables }) => {
  const block = fetchNodeByPosition({ document, position });
  if (!cachedVariables) {
    cachedVariables = await readVariableFromCache();
  }
  const variables = cachedVariables;
  const wordRange = document.getWordRangeAtPosition(position);
  if (wordRange) {
    const word = document.getText(wordRange);
    const uniqueFilePath = getUniqueFilePath(document.fileName);
    const uniqueKey = `${uniqueFilePath}.${block.scopeChain}.${word}`.replace(/\.{2,}/g, ".");
    return markdownOnHover(variables[uniqueKey]?.value);
  }
  return null;
};

module.exports = {
  hoverHandler,
};
