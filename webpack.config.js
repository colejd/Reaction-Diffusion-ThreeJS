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
  // plugins.push(new UglifyJsPlugin({ minimize: true }));
  outputFile = libraryName + '.min.js';
} else {
  outputFile = libraryName + '.js';
}

const config = {
  entry: './src/main.js',
  mode: env === 'build' ? 'production' : 'development',
  devtool: env === 'build' ? false : 'eval-source-map',
  output: {
    path: path.resolve(__dirname, 'dist/'),
    filename: outputFile,
    library: libraryName,
    libraryTarget: 'umd',
    umdNamedDefine: true
  },
  module: {
    rules: [
      {
        test: /\.(png|glsl)$/i,
        loader: 'file-loader',
        options: {
          outputPath: 'resources/',
          name: '[name].[ext]',
        }
      },
      { // Process js files
        test: /(\.jsx|\.js)$/,
        loader: 'babel-loader',
        exclude: /(node_modules)/
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
    compress: false,
    open: true,
    openPage: 'basic_example.html', // Relative to contentBase
    contentBase: path.join(__dirname, 'example'),
    watchContentBase: true,
    publicPath: '/js', // Contents of /dist will be in a virtual path called `/js` for example html pages
  }
};

module.exports = config;
