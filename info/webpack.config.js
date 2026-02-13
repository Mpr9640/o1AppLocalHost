// webpack.config.js
const path = require("path");
const webpack = require("webpack");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");

const commonRules = [
  {
    test: /\.js$/,
    exclude: /node_modules/,
    use: { loader: "babel-loader", options: { presets: ["@babel/preset-env"] } },
  },
];

const commonPlugins = [
  new webpack.DefinePlugin({
    "process.env.REACT_APP_BACKEND_URL": JSON.stringify(
      process.env.REACT_APP_BACKEND_URL || "http://localhost:8000"
    ),
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
    process: "undefined",
  }),
  new Dotenv({ path: "./.env", safe: true, systemvars: true }),
];

const copyPlugin = new CopyWebpackPlugin({
  patterns: [
    { from: "extension/manifest.json", to: "" },
    { from: "extension/images", to: "images" },
    { from: "extension/popup", to: "popup" },
    { from: "extension/scripts", to: "scripts" },

    { from: "extension/offscreen/offscreen.html", to: "offscreen/offscreen.html" },
    { from: "extension/offscreen/offscreen.bootstrap.js", to: "offscreen/offscreen.bootstrap.js" },

    {
      from: path.resolve(__dirname, "node_modules/@huggingface/transformers/dist"),
      to: "offscreen/vendor/onnx",
      filter: (p) => /[/\\]ort-wasm.*\.(mjs|wasm)$/.test(p),
      noErrorOnMissing: true,
    },
    {
      from: path.resolve(__dirname, "node_modules/onnxruntime-web/dist"),
      to: "offscreen/vendor/onnx",
      filter: (p) => /[/\\]ort-wasm.*\.(mjs|wasm)$/.test(p),
      noErrorOnMissing: true,
    },
  ],
});

const dist = path.resolve(__dirname, "dist");

// ✅ CLASSIC bundles (content scripts)
const classicConfig = {
  name: "classic",
  mode: "development",
  devtool: "cheap-module-source-map",
  entry: {
    contentscript: "./extension/scripts/contentscript.js",
    atswatchers: "./extension/scripts/atswatchers.js",
    resumechecking: "./extension/scripts/resumechecking.js",
    page_probe: "./extension/scripts/pageprobe.js",
  },
  output: {
    path: dist,
    filename: (pathData) => {
      const name = pathData.chunk.name;
      if (name === "contentscript") return "contentscript.bundle.js";
      if (name === "atswatchers") return "atswatchers.bundle.js";
      if (name === "resumechecking") return "resumechecking.bundle.js";
      if (name === "page_probe") return "page_probe.bundle.js";
      return "[name].bundle.js";
    },
    // ✅ IMPORTANT: classic/IIFE
    iife: true,
    library: { type: "var", name: "__JA_UNUSED__" }, // keeps webpack from ESM
    module: false,
  },
  experiments: {
    outputModule: false,
  },
  module: { rules: commonRules },
  plugins: [...commonPlugins, copyPlugin],
};

// ✅ MODULE bundles (background/offscreen)
const moduleConfig = {
  name: "module",
  mode: "development",
  devtool: "cheap-module-source-map",
  entry: {
    background: "./extension/background.js",
    offscreen: "./extension/offscreen/offscreen.js",
    autofill: "./extension/scripts/autofill.js",
  },
  output: {
    path: dist,
    filename: (pathData) => {
      const name = pathData.chunk.name;
      if (name === "background") return "background.bundle.js";
      if (name === "offscreen") return "offscreen.bundle.js";
      if (name === "autofill") return "autofill.bundle.js";
      return "[name].bundle.js";
    },
    module: true,
    library: { type: "module" },
  },
  experiments: {
    outputModule: true,
  },
  module: { rules: commonRules },
  plugins: commonPlugins, // copy already done in classic config; avoid duplicating
};

module.exports = [classicConfig, moduleConfig];
