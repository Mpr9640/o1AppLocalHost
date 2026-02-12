// webpack.config.js
const path = require('path');
const webpack = require('webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const Dotenv = require('dotenv-webpack');

module.exports = {
  entry: {
    contentscript: './extension/scripts/contentscript.js',
    atswatchers: './extension/scripts/atswatchers.js',
    background: './extension/background.js',
    autofill: './extension/scripts/autofill.js',
    offscreen: './extension/offscreen/offscreen.js',
    resumechecking: './extension/scripts/resumechecking.js',
    page_probe: './extension/scripts/pageprobe.js' 
  },

  // Put each entry where we want it to land
  output: {
    filename: (pathData) => {
      const name = pathData.chunk.name;
      if(name === 'contentscript') return 'contentscript.bundle.js';
      if(name === 'atswatchers') return 'atswatchers.bundle.js';
      if (name === 'background') return 'background.bundle.js';
      if (name === 'autofill')   return 'autofill.bundle.js';
      if (name === 'resumechecking')  return 'resumechecking.bundle.js';
      if (name === 'offscreen')  return 'offscreen.bundle.js'; // <— bundle under /offscreen
      //if (name === 'pageprobe')     return 'pageprobe.js'; 
      return '[name].bundle.js';
    },
    path: path.resolve(__dirname, 'dist'),
    module: true,                // ESM output (OK for MV3)
    libraryTarget: 'module',     // ESM
    
  },

  mode: 'development',
  devtool: 'cheap-module-source-map',

  plugins: [
    new webpack.DefinePlugin({
      'process.env.REACT_APP_BACKEND_URL': JSON.stringify(process.env.REACT_APP_BACKEND_URL || 'http://localhost:8000'),
      'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development'),
      'process': 'undefined', // some libs probe it
    }),

    // Copy ONLY the offscreen static files we need; do NOT copy the source offscreen.js
    new CopyWebpackPlugin({
      patterns: [
        { from: 'extension/manifest.json', to: '' },
        { from: 'extension/images',        to: 'images' },
        { from: 'extension/popup',         to: 'popup' },
        { from: 'extension/scripts',       to: 'scripts' },

        // Only copy offscreen HTML + bootstrap (not the whole folder)
        { from: 'extension/offscreen/offscreen.html',     to: 'offscreen/offscreen.html' },
        { from: 'extension/offscreen/offscreen.bootstrap.js', to: 'offscreen/offscreen.bootstrap.js' },

        // Copy ONNX loader + WASM from transformers dist (Option A)
        {
          from: path.resolve(__dirname, 'node_modules/@huggingface/transformers/dist'),
          to: 'offscreen/vendor/onnx',
          filter: (p) => /[/\\]ort-wasm.*\.(mjs|wasm)$/.test(p),
          noErrorOnMissing: true,
        },

        // Fallback: copy from onnxruntime-web if not in transformers
        {
          from: path.resolve(__dirname, 'node_modules/onnxruntime-web/dist'),
          to: 'offscreen/vendor/onnx',
          filter: (p) => /[/\\]ort-wasm.*\.(mjs|wasm)$/.test(p),
          noErrorOnMissing: true,
        },
      ],
    }),
    new Dotenv({ path: './.env', safe: true, systemvars: true }),
  ],

  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: { loader: 'babel-loader', options: { presets: ['@babel/preset-env'] } },
      },
    ],
  },

  experiments: {
    outputModule: true, // required for ESM output
  },
};
