/* global __dirname, require, module*/

const webpack = require('webpack');
const UglifyJsPlugin = webpack.optimize.UglifyJsPlugin;
const path = require('path');
const env = require('yargs').argv.env; // use --env with webpack 2

// Get values from package.json
var package = require("./package.json");

let libraryName = package.name;

let plugins = [], outputFile;

if (env === 'build') {
  plugins.push(new UglifyJsPlugin({ minimize: true }));
  outputFile = libraryName + '.min.js';
} else {
  outputFile = libraryName + '.js';
}

const config = {
  entry: __dirname + '/src/main.js',
  devtool: 'source-map',
  output: {
    path: __dirname + '/dist',
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    rules: [
      {
        test: /\.(png|glsl)$/,
        use: [
          {
            loader: 'file-loader',
            options: {
              outputPath: 'resources/',
              name: '[name].[ext]',
              publicPath: '/dist/'
            }  
          }
        ]
      },
      { // Process js files
        test: /(\.jsx|\.js)$/,
        loader: 'babel-loader',
        exclude: /(node_modules|bower_components)/
      },
    //   { // Lint all js files with eslint-loader
    //     test: /(\.jsx|\.js)$/,
    //     loader: 'eslint-loader',
    //     exclude: /node_modules/
    //   }
    ]
  },
  resolve: {
    modules: [path.resolve('./node_modules'), path.resolve('./src')],
    extensions: ['.json', '.js']
  },
  plugins: plugins,
  devServer: {
    compress: true,
    open: true,
    openPage: 'example'
  }
};

module.exports = config;
