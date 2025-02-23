const { CACHE_FILE } = require("../../config/constants");

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

    let result = response.result.replace(/\`/g, "").replace(/\'/g, "").replace(/\\\\n/g, "").replace(/\\\\/g, "\\");
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
            nodeObj.params = parent?.params;
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
          } else if (parent?.type === "WhileStatement") {
          } else if (parent?.type === "DoWhileStatement") {
          } else if (parent?.type === "WithStatement") {
          } else if (parent?.type === "StaticBlock") {
          } else {
            console.log("Block inside an unhandled structure:", parent?.type);
          }

          scopeStack.push(nodeObj.nodeName);
          nodeObj.scopeChain = scopeStack?.join(".");

          Nodes.push(nodeObj);
        }
        if (node.type === "ClassDeclaration") {
          scopeStack.push(node?.id?.name);
        }

        // HANDLE OUTLIER CASES
        if (node.type === "SwitchStatement") {
          const nodeName = `SwitchStatement(${node?.discriminant?.name})`;
          scopeStack.push(nodeName);
          Nodes.push({
            scopeChain: scopeStack?.join("."),
            nodeName,
            loc: node?.loc,
            blockSize: node?.loc?.end?.line - node?.loc?.start?.line,
            bindings: scope.bindings,
          });
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

const saveNodeToDisk = async (nodes, stateManager) => {
  try {
    // 📌 Step 1: Build finalMap (your existing logic)
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

    // 📌 Step 2: Save to state instead of file
    await stateManager.update(finalMap);
    console.log("✅ Data saved successfully to state");
  } catch (error) {
    console.error("❌ Failed to save nodes:", error);
  }
};

const fetchSerializerFunction = (variableName) => {
  return `
                            const serializeValue = function(value, depth = 0, maxDepth = 3, seen = new WeakSet()) {
                                // Handle max depth
                                if (depth > maxDepth) return '...';
    
                                // Handle primitives
                                if (value === null) return null;
                                if (value === undefined) return undefined;
                                if (typeof value !== 'object' && typeof value !== 'function') {
                                    return value;
                                }
    
                                // Handle circular references
                                if (value && typeof value === 'object') {
                                    if (seen.has(value)) return '[Circular]';
                                    seen.add(value);
                                }
    
                                // Handle Date
                                if (value instanceof Date) {
                                    return {
                                        __type: 'Date',
                                        value: value.toISOString()
                                    };
                                }
    
                                // Handle arrays
                                if (Array.isArray(value)) {
                                    return value.slice(0,1).map(item => serializeValue(item, depth + 1, maxDepth, seen));
                                }
    
                                // Handle Map
                                if (value instanceof Map) {
                                    return {
                                        __type: 'Map',
                                        value: Object.fromEntries(
                                            Array.from(value.entries()).map(([k, v]) => [
                                                serializeValue(k, depth + 1, maxDepth, seen),
                                                serializeValue(v, depth + 1, maxDepth, seen)
                                            ])
                                        )
                                    };
                                }
    
                                // Handle Set
                                if (value instanceof Set) {
                                    return {
                                        __type: 'Set',
                                        value: Array.from(value).map(item => 
                                            serializeValue(item, depth + 1, maxDepth, seen)
                                        )
                                    };
                                }
    
                                // Handle functions
                                if (typeof value === 'function') {
                                    return {
                                        __type: 'Function',
                                        value: value.toString()
                                    }
                                }
    
                                // Handle regular objects and class instances
                                const result = {};
                                const isClass = value.constructor && value.constructor.name !== 'Object';
                                if (isClass) {
                                    result.__info = {
                                        type: 'Class',
                                        class: value.constructor.name
                                    }
                                }
    
                                const props = Object.getOwnPropertyNames(value);
                                for (const prop of props) {
                                    try {
                                        const descriptor = Object.getOwnPropertyDescriptor(value, prop);
                                        if (descriptor.get || descriptor.set) {
                                            result[prop] = '<getter/setter>';
                                        } else {
                                            result[prop] = serializeValue(value[prop], depth + 1, maxDepth, seen);
                                        }
                                    } catch (error) {
                                        result[prop] = '<error>';
                                    }
                                }
                                return result;
                            }
                            JSON.stringify(serializeValue(${variableName}), null, 2);
    `;
};

module.exports = {
  getCompleteVariable,
  traverseFile,
  getUniqueFilePath,
  saveNodeToDisk,
  fetchSerializerFunction,
};
