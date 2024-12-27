// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const esprima = require('esprima');
const estraverse = require('estraverse');
const escodegen = require('escodegen');


// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated

	const hoverProvider = vscode.languages.registerHoverProvider(['javascript'], {
		async provideHover(document, position) {
			const wordRange = document.getWordRangeAtPosition(position);
			const nodes = traverseFile({ filePath: document.fileName })

			const uniqueFilePath = getUniqueFilePath(document.fileName)
			const block = nodes.find(node => (node.loc.start.line <= position.line) && (position.line <= node.loc.end.line))
			

			let variables = {}
			try {
				const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
				const cacheFilePath = path.join(workspacePath, '.function_cache.json');
				const data = await fs.readFileSync(cacheFilePath, {encoding: 'utf8'});
				variables = JSON.parse(data);
			} catch (error) {
				if (error.code !== 'ENOENT') {
					console.error('Failed to read the cache file:', error);
					throw error; // Rethrow unexpected errors
				}
			}
			if (wordRange) {
				const word = document.getText(wordRange);
				const uniqueKey = `${uniqueFilePath}.${block.scopeChain}.${word}`
				console.log(variables[uniqueKey])


				const hoverContent = new vscode.MarkdownString();
				hoverContent.isTrusted = true; // Allows richer rendering if needed
				hoverContent.supportHtml = true; // Enable support for inline HTML (if necessary)

				hoverContent.appendMarkdown(`### Variable Details\n`);
				hoverContent.appendCodeblock(JSON.stringify(variables[uniqueKey]?.value, null, 2), 'json');

				return new vscode.Hover(hoverContent);
			}
			return null;
		}
	});

	// Monitor debug sessions to capture function outputs
	vscode.debug.onDidStartDebugSession(async (session) => {
		if (session.type === 'node' || session.type === 'pwa-node' || session.type === 'debugpy') {
			console.log("Started debugging session: Capturing function calls...");

			async function getCompleteVariable(session, variableName, variableType, frameId) {
				try {
					// This function will be evaluated in the debug context
					const serializerFunction = `
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
								return value.map(item => serializeValue(item, depth + 1, maxDepth, seen));
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
								return value.toString()
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
						JSON.stringify(serializeValue(${variableName}));
					`;

					const response = await session.customRequest('evaluate', {
						expression: serializerFunction,
						frameId: frameId,
						context: 'watch'
					});

					const result = response.result.replace(/\\\\n/g, '').replace(/\'/g, '');
					return JSON.parse(result)
				} catch (error) {
					console.error('Error evaluating variable:', error);
					return {
						type: 'error',
						error: error.message
					};
				}
			}

			const debugSessionHandler = vscode.debug.registerDebugAdapterTrackerFactory('*', {
				createDebugAdapterTracker() {
					let currentStackTrace = [];
					let currentScope = [];
					let currentVariables = [];
					let nodesPerFile = {};

					return {
						onWillReceiveMessage(message) {
							if (message.type === 'request') {
                                if (message.command === 'stackTrace') {
									currentStackTrace.push({request: message})
                                }else if(message.command === 'scopes'){
                                    currentScope.push({request: message})
                                }else if (message.command === 'variables') {
                                    currentVariables.push({request: message})
                                }
							}
						},
						async onDidSendMessage(message) {
							if (message.type === 'response') {
                                if (message.command === 'stackTrace' && message.success) {
									const machingStackTrace = currentStackTrace.find(t => t.request.seq === message.request_seq)
									machingStackTrace.response = structuredClone(message);
                                }else if(message.command === 'scopes' && message.success){
									const machingScope = currentScope.find(t => t.request.seq === message.request_seq)
									machingScope.response = structuredClone(message);
                                }else if (message.command === 'variables' && message.success) {
									const machingVariables = currentVariables.find(t => t.request.seq === message.request_seq)
									machingVariables.response = structuredClone(message);
									
									// For variables that are objects, get their complete structure
									const currentBlockVariables = currentVariables.find(v => v.request.arguments.variablesReference === currentScope?.[0]?.response?.body?.scopes?.[0]?.variablesReference)?.response?.body?.variables ?? []
									for (const variable of currentBlockVariables) {
										if(variable.type === 'global') continue;
										const frameId = currentStackTrace[0].response.body.stackFrames[0].id;
										const completeValue = await getCompleteVariable(
											vscode.debug.activeDebugSession, 
											variable.name, 
											variable.type,
											frameId
										);
										if (completeValue) {
											variable.value = completeValue;
										}
									}
                                }
							} else if (message.type === 'event') {
								if (message.event === 'continued') {
									if(currentStackTrace.length > 0) {
										const uniqueFilePath = getUniqueFilePath(currentStackTrace[0].response.body.stackFrames[0].source.path)
										if(!nodesPerFile[uniqueFilePath]) {
											const nodes = traverseFile({ filePath: currentStackTrace[0].response.body.stackFrames[0].source.path })
											nodesPerFile[uniqueFilePath] = nodes
										}

										const lineNumber = currentStackTrace[0].response.body.stackFrames[0].line

										const block = nodesPerFile[uniqueFilePath].find(node => (node.loc.start.line <= lineNumber) && (lineNumber <= node.loc.end.line))
										const variables = currentVariables.find(v => v.request.arguments.variablesReference === currentScope[0].response.body.scopes[0].variablesReference).response.body.variables
										block.variables = variables

										currentStackTrace = []
										currentScope = []
										currentVariables = []
									}
								}
							}
						},
						onError(error) {
							console.error('Debug adapter error:', error);
						},
						onExit(code, signal) {
							console.log('Debug adapter exit:', code, signal);
						},
						async onWillStopSession(){
							await saveNodeToDisk(nodesPerFile)
							console.log('Stop Session');
						}
					};
				}
			});

			context.subscriptions.push(debugSessionHandler);
		}
	});

	context.subscriptions.push(hoverProvider);
}

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
		const cacheFilePath = path.join(workspacePath, '.function_cache.json');

		// 📌 Step 3: Load existing data if the file exists
		let existingNodes = {};
		try {
			const data = await fs.readFileSync(cacheFilePath, {encoding: 'utf8'});
			existingNodes = JSON.parse(data);
		} catch (error) {
			if (error.code !== 'ENOENT') {
				console.error('Failed to read the cache file:', error);
				throw error; // Rethrow unexpected errors
			}
		}

		// 📌 Step 4: Merge existing data with finalMap
		const mergedData = { ...existingNodes, ...finalMap };

		// 📌 Step 5: Write back to the hidden file
		await fs.writeFileSync(cacheFilePath, JSON.stringify(mergedData, null, 2), 'utf-8');
		console.log(`✅ Data saved successfully to ${cacheFilePath}`);
	} catch (error) {
		console.error('❌ Failed to save nodes to disk:', error);
	}
};


// This method is called when your extension is deactivated
function deactivate(functionNameWith) {}

const traverseFile = ({ filePath }) => {
	const code = fs.readFileSync(filePath, 'utf-8');
    const ast = esprima.parseScript(code, { loc: true });

	const scopeStack = [];
	const functionNodes = []
    estraverse.traverse(ast, {
        enter: (node, parent) => {
			// console.log({ node, parent})
			const nodeObj = {
				scopeChain: '',
				loc: node?.loc,
				blockSize: node?.loc?.end?.line - node?.loc?.start?.line,
				nodeName: node?.id?.name,
				parameters: node?.params,
				type: node?.type,
			};

			if (node.type === 'FunctionDeclaration') {
				scopeStack.push(node.id.name);
				nodeObj.scopeChain = scopeStack?.join('.')
				functionNodes.push(nodeObj)
			}

			if (node.type === 'ObjectExpression') {
				const AnyFunctionExpression = node.properties.some(p => p.value.type === 'FunctionExpression');
				if (AnyFunctionExpression) {
                    scopeStack.push(parent.id.name);
                }
			}

			if (node.type === 'Property' && node.value.type === 'FunctionExpression') {
				scopeStack.push(node.key.name);
				nodeObj.scopeChain = scopeStack?.join('.')
				nodeObj.nodeName = node.key.name
				nodeObj.parameters = node.value.params
				functionNodes.push(nodeObj);
			}

			if (node.type === 'ClassDeclaration') {
				scopeStack.push(node.id.name);
				nodeObj.scopeChain = scopeStack?.join('.')
				functionNodes.push(nodeObj)
			}
	
			if (node.type === 'MethodDefinition') {
				scopeStack.push(node.key.name);
				nodeObj.scopeChain = scopeStack?.join('.')
				nodeObj.nodeName = node.key.name
				nodeObj.parameters = node.value.params
				functionNodes.push(nodeObj)
			}

			if(node.type === 'BlockStatement' && parent.type === 'IfStatement'){
				nodeObj.name = `IfBlock(${escodegen.generate(parent.test)})`
				scopeStack.push(nodeObj.name);
				nodeObj.scopeChain = scopeStack?.join('.')
				functionNodes.push(nodeObj)
			}
        },
		leave: (node, parent) => {
            if (
				node.type === 'FunctionDeclaration' ||
				node.type === 'ClassDeclaration' ||
				node.type === 'MethodDefinition' || 
				(node.type === 'BlockStatement' && parent.type === 'IfStatement') ||
				(node.type === 'Property' && node.value.type === 'FunctionExpression') ||
				(node.type === 'ObjectExpression' && node.properties.some(p => p.value.type === 'FunctionExpression'))
			) {
				scopeStack.pop();
			}
        }
    });

	return functionNodes.sort((a, b) => a.blockSize - b.blockSize);
}
const getUniqueFilePath = (filePath) =>{
	const workspaceFolders = vscode.workspace.workspaceFolders;
	for(const {name: folder} of workspaceFolders){
		const regex = new RegExp(`/${folder}/`);
		const match = filePath.match(regex);
		
		if (match) {
			const startIndex = match.index;
			if (startIndex !== undefined) {
				const relativeFilePath = filePath.substring(startIndex + 1); // +1 to remove the leading slash
				return relativeFilePath.replace(/\//g, '.')
			}
		}
    }
	return `unknown.${filePath.split('/').pop()}`
}



module.exports = {
	activate,
	deactivate
}