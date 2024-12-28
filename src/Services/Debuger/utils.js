const { CACHE_FILE } = require("../../Constants/config");

const { fetchSerializerFunction } = require("./serialize");

const esprima = require("esprima");
const estraverse = require("estraverse");
const escodegen = require("escodegen");
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");

const getCompleteVariable = async (
  session,
  variableName,
  variableType,
  frameId
) => {
  try {
    // This function will be evaluated in the debug context
    const serializerFunction = fetchSerializerFunction(variableName);
    const response = await session.customRequest("evaluate", {
      expression: serializerFunction,
      frameId: frameId,
      context: "watch",
    });

    const result = response.result.replace(/\\\\n/g, "").replace(/\'/g, "");
    return JSON.parse(result);
  } catch (error) {
    console.error("Error evaluating variable:", error);
    return {
      type: "error",
      error: error.message,
    };
  }
};
const traverseFile = ({ filePath }) => {
  const code = fs.readFileSync(filePath, "utf-8");
  const ast = esprima.parseScript(code, { loc: true });

  const scopeStack = [];
  const Nodes = [];
  estraverse.traverse(ast, {
    enter: (node, parent) => {
      const nodeObj = {
        scopeChain: "",
        loc: node?.loc,
        blockSize: node?.loc?.end?.line - node?.loc?.start?.line,
        nodeName: node?.id?.name,
        parameters: node?.params,
        type: node?.type,
      };

      if (node.type === "FunctionDeclaration") {
        scopeStack.push(node.id.name);
        nodeObj.scopeChain = scopeStack?.join(".");
        Nodes.push(nodeObj);
      }

      if (node.type === "ObjectExpression") {
        const AnyFunctionExpression = node.properties.some(
          (p) => p.value.type === "FunctionExpression"
        );
        if (AnyFunctionExpression) {
          scopeStack.push(parent.id.name);
        }
      }

      if (
        node.type === "Property" &&
        node.value.type === "FunctionExpression"
      ) {
        scopeStack.push(node.key.name);
        nodeObj.scopeChain = scopeStack?.join(".");
        nodeObj.nodeName = node.key.name;
        nodeObj.parameters = node.value.params;
        Nodes.push(nodeObj);
      }

      if (node.type === "ClassDeclaration") {
        scopeStack.push(node.id.name);
        nodeObj.scopeChain = scopeStack?.join(".");
        Nodes.push(nodeObj);
      }

      if (node.type === "MethodDefinition") {
        scopeStack.push(node.key.name);
        nodeObj.scopeChain = scopeStack?.join(".");
        nodeObj.nodeName = node.key.name;
        nodeObj.parameters = node.value.params;
        Nodes.push(nodeObj);
      }

      if (node.type === "BlockStatement" && parent.type === "IfStatement") {
        nodeObj.name = `IfBlock(${escodegen.generate(parent.test)})`;
        scopeStack.push(nodeObj.name);
        nodeObj.scopeChain = scopeStack?.join(".");
        Nodes.push(nodeObj);
      }
    },
    leave: (node, parent) => {
      if (
        node.type === "FunctionDeclaration" ||
        node.type === "ClassDeclaration" ||
        node.type === "MethodDefinition" ||
        (node.type === "BlockStatement" && parent.type === "IfStatement") ||
        (node.type === "Property" &&
          node.value.type === "FunctionExpression") ||
        (node.type === "ObjectExpression" &&
          node.properties.some((p) => p.value.type === "FunctionExpression"))
      ) {
        scopeStack.pop();
      }
    },
  });

  return Nodes.sort((a, b) => a.blockSize - b.blockSize);
};
const getUniqueFilePath = (filePath) => {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  for (const { name: folder } of workspaceFolders) {
    const regex = new RegExp(`/${folder}/`);
    const match = filePath.match(regex);

    if (match) {
      const startIndex = match.index;
      if (startIndex !== undefined) {
        const relativeFilePath = filePath.substring(startIndex + 1); // +1 to remove the leading slash
        return relativeFilePath.replace(/\//g, ".");
      }
    }
  }
  return `unknown.${filePath.split("/").pop()}`;
};
const saveNodeToDisk = async (nodes) => {
  try {
    // 📌 Step 1: Build finalMap
    const finalMap = {};
    for (const uniquePathKey of Object.keys(nodes)) {
      for (const node of nodes[uniquePathKey]) {
        const { scopeChain, variables } = node;
        if (variables && variables.length > 0) {
          for (const variable of variables) {
            finalMap[`${uniquePathKey}.${scopeChain}.${variable.name}`] = {
              type: variable.type,
              value: variable.value,
            };
          }
        }
      }
    }

    // 📌 Step 2: Define the hidden file path
    const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
    const cacheFilePath = path.join(workspacePath, CACHE_FILE);

    // 📌 Step 3: Load existing data if the file exists
    let existingNodes = {};
    try {
      const data = await fs.readFileSync(cacheFilePath, { encoding: "utf8" });
      existingNodes = JSON.parse(data);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("Failed to read the cache file:", error);
        throw error; // Rethrow unexpected errors
      }
    }

    // 📌 Step 4: Merge existing data with finalMap
    const mergedData = { ...existingNodes, ...finalMap };

    // 📌 Step 5: Write back to the hidden file
    await fs.writeFileSync(
      cacheFilePath,
      JSON.stringify(mergedData, null, 2),
      "utf-8"
    );
    console.log(`✅ Data saved successfully to ${cacheFilePath}`);
  } catch (error) {
    console.error("❌ Failed to save nodes to disk:", error);
  }
};

module.exports = {
  getCompleteVariable,
  traverseFile,
  getUniqueFilePath,
  saveNodeToDisk,
};
