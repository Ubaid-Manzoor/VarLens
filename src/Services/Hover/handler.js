const { getUniqueFilePath } = require("../debug/utils");
const { fetchNodeByPosition, markdownOnHover } = require("./utils");

const hoverHandler = async ({ document, position, cachedVariables, stateManager }) => {
  const block = fetchNodeByPosition({ document, position });

  // Get variables from stateManager if not cached
  if (!cachedVariables) {
    cachedVariables = await stateManager.get();
  }

  const wordRange = document.getWordRangeAtPosition(position);
  if (wordRange) {
    const word = document.getText(wordRange);
    const uniqueFilePath = getUniqueFilePath(document.fileName);
    const uniqueKey = `${uniqueFilePath}.${block.scopeChain}.${word}`.replace(/\.{2,}/g, ".");
    return markdownOnHover(cachedVariables[uniqueKey]?.value);
  }
  return null;
};

module.exports = {
  hoverHandler,
};
