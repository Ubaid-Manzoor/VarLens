const vscode = require("vscode");

const inspectVariableCommandHandler = ({ variableValue }) => {
  try {
    const panel = vscode.window.createWebviewPanel(
      "inspectVariable", // Identifier
      "Inspect Variable", // Title
      vscode.ViewColumn.Beside, // Open beside the current editor
      {
        enableScripts: true, // Enable JavaScript in the webview
      }
    );

    // Send JSON data to the webview
    const jsonData = JSON.stringify(variableValue, null, 2);

    panel.webview.html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>Inspect Variable</title>
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.2/jsoneditor.min.css">
          <script src="https://cdnjs.cloudflare.com/ajax/libs/jsoneditor/9.10.2/jsoneditor.min.js"></script>
          <style>
            body {
              margin: 0;
              font-family: Arial, sans-serif;
              height: 100vh;
              display: flex;
              flex-direction: column;
            }
            #jsoneditor {
              flex-grow: 1;
              border: 1px solid #ddd;
            }
          </style>
        </head>
        <body>
          <h2>VarLens</h2>
          <div id="jsoneditor"></div>
          <script>
            const container = document.getElementById("jsoneditor");
            const options = {
              mode: "view", // View-only mode
              mainMenuBar: true, // Enable main menu
              statusBar: true, // Enable status bar
              onError: function (err) {
                alert(err.toString());
              }
            };
            const editor = new JSONEditor(container, options);
            const json = ${jsonData};
            editor.set(json);
          </script>
        </body>
        </html>
      `;
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to inspect variable: ${error.message}`);
  }
};

module.exports = {
  inspectVariableCommandHandler,
};
