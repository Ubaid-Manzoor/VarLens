const { CACHE_FILE } = require("../../Constants/config.js");

const { fetchSerializerFunction } = require("./serialize.js");

const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const { parse } = require("@babel/parser");
const traverse = require("@babel/traverse");
const generator = require("@babel/generator").default;

const getCompleteVariable = async (session, variableName, variableType, frameId) => {
  try {
    // This function will be evaluated in the debug context
    const serializerFunction = fetchSerializerFunction(variableName);
    let response = await session.customRequest("evaluate", {
      expression: serializerFunction,
      frameId: frameId,
      context: "inline",
    });

    let result = response.result.replace(/\'/g, "").replace(/\\\\n/g, "").replace(/\\\\/g, "\\");
    if (result === undefined || result === null) return result;
    if (result === "undefined" || result === "null") return result === "undefined" ? undefined : null;
    return JSON.parse(result);
  } catch (error) {
    console.error("Error evaluating variable:", error);
    return undefined;
  }
};
const getFullCalleePath = (callee) => {
  if (callee?.type === "MemberExpression") {
    const objectPath = getFullCalleePath(callee.object);
    return objectPath ? `${objectPath}.${callee.property.name}` : callee.property.name;
  }
  return callee?.name || "";
};

const handleArrowFunction = ({ scope }) => {
  const callee = scope?.parentBlock?.callee;

  if (callee?.type === "MemberExpression") {
    const fullPath = getFullCalleePath(callee);

    let firstArgument = "";
    if (scope?.parentBlock?.arguments?.length) {
      const arg = scope?.parentBlock?.arguments?.[0];
      if (arg?.type === "StringLiteral") {
        firstArgument = `.${arg.value}`;
      } else if (arg?.type === "Identifier") {
        firstArgument = `.${arg.name}`;
      }
    }

    return `${fullPath}${firstArgument}`;
  } else {
    return scope?.parentBlock?.id?.name ?? scope?.parent?.id?.name ?? "unknown";
  }
};

const handleIfCondition = ({ parent }) => {
  if (parent?.test?.type === "BooleanLiteral") return `${parent.type}.${parent?.test?.value}`;
  else return `${parent?.type}(${generator(parent.test).code})`;
};

const traverseFile = ({ filePath }) => {
  const code = fs.readFileSync(filePath, "utf-8");
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"],
  });

  const scopeStack = [];
  const Nodes = [];
  traverse.default(ast, {
    enter: (data) => {
      try {
        const { node, parent, scope } = data;
        if (node.type === "BlockStatement") {
          const nodeObj = {
            scopeChain: "",
            loc: node?.loc,
            blockSize: node?.loc?.end?.line - node?.loc?.start?.line,
            bindings: scope.bindings,
            type: parent?.type,
          };

          if (parent?.type === "ArrowFunctionExpression") {
            const name = handleArrowFunction({ node, parent, scope });
            nodeObj.nodeName = name;
          } else if (scope?.block?.type === "FunctionDeclaration") {
            nodeObj.nodeName = parent?.id?.name;
          } else if (scope?.block?.type === "FunctionExpression") {
            if (scope?.parentBlock?.type === "ObjectProperty") {
              nodeObj.nodeName = scope?.parentBlock?.key?.name;
            }
          } else if (parent?.type === "ClassMethod") {
            nodeObj.nodeName = parent?.key?.name;
          } else if (parent?.type === "TryStatement") {
            nodeObj.nodeName = parent?.type;
          } else if (parent?.type === "CatchClause") {
            nodeObj.nodeName = parent?.type;
          } else if (parent?.type === "IfStatement") {
            nodeObj.nodeName = handleIfCondition({ parent, scope });
          } else if (parent?.type === "ForStatement") {
            nodeObj.nodeName = `${parent?.type}(${generator(parent.test).code})`;
          } else if (parent?.type === "ForInStatement") {
            nodeObj.nodeName = `${parent?.type}.${parent.right.name}`;
          } else if (parent?.type === "ForOfStatement") {
            nodeObj.nodeName = `${parent?.type}.${parent.right.name}`;
          } else if (parent?.type === "BlockStatement") {
          } else if (parent?.type === "WhileStatement") {
          } else if (parent?.type === "SwitchCase") {
          } else if (parent?.type === "DoWhileStatement") {
          } else if (parent?.type === "WithStatement") {
          } else if (parent?.type === "StaticBlock") {
          } else {
            console.log("Block inside an unhandled structure:", parent?.type);
          }

          scopeStack.push(nodeObj.nodeName);
          nodeObj.scopeChain = scopeStack?.join(".");
          // Nodes.push({ line: node?.loc?.start?.line, node, parent, scope });
          Nodes.push(nodeObj);
        }

        if (node.type === "ClassDeclaration") {
          scopeStack.push(node?.id?.name);
        }
        if (node?.type === "Program") {
          Nodes.push({
            nodeName: node?.type,
            scopeChain: "",
            loc: node?.loc,
            blockSize: node?.loc?.end?.line - node?.loc?.start?.line,
            bindings: scope.bindings,
          });
        }
      } catch (error) {
        console.log(error);
      }
    },
    exit: (node) => {
      if (node.type === "BlockStatement" || node.type === "ClassDeclaration") {
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
            const key = `${uniquePathKey}.${scopeChain}.${variable.name}`.replace(/\.{2,}/g, ".");
            finalMap[key] = {
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
        existingNodes = {};
      }
    }

    console.log({ existingNodes, finalMap });
    // 📌 Step 4: Merge existing data with finalMap
    const mergedData = { ...existingNodes, ...finalMap };
    console.log({ mergedData });

    // 📌 Step 5: Write back to the hidden file
    await fs.writeFileSync(cacheFilePath, JSON.stringify(mergedData, null, 2), "utf-8");
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
