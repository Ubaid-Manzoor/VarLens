//@ts-check

"use strict";

const path = require("path");
const webpack = require("webpack");

/**@type {import('webpack').Configuration}*/
const config = {
  target: "node", // vscode extensions run in webworker context for VS Code web 📖 -> https://webpack.js.org/configuration/target/#target
  entry: "./src/extension.js", // the entry point of this extension, 📖 -> https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
    devtoolModuleFilenameTemplate: "../[resource-path]",
  },
  devtool: "source-map",
  externals: {
    vscode: "commonjs vscode", // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed, 📖 -> https://webpack.js.org/configuration/externals/
  },
  resolve: {
    fallback: {
      fs: false, // If `fs` doesn't need to be polyfilled, set to false
      path: require.resolve("path-browserify"),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: "ts-loader",
          },
        ],
      },
    ],
  },
};
module.exports = config;
