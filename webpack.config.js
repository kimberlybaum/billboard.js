const pkg = require("./package.json");
const path = require("path");
const webpack = require("webpack");
const StringReplacePlugin = require("string-replace-webpack-plugin");
const Stylish = require("webpack-stylish");
const WebpackMonitor = require("webpack-monitor");
const WebpackBar = require("webpackbar");

const config = {
	entry: {
		billboard: [
			"./src/scss/billboard.scss",
			"./src/core.js"
		]
	},
	output: {
		path: path.resolve(__dirname, "dist"),
		filename: "[name].js",
		libraryTarget: "umd",
		umdNamedDefine: true,
		globalObject: "this"
	},
	externals: (context, request, callback) => {
		// every 'd3-*' import, will be externally required as their name except root as 'd3'
		if (/^d3-/.test(request)) {
			return callback(null, {
				commonjs: request,
				commonjs2: request,
				amd: request,
				root: "d3"
			});
		}

		callback();
	},
	devtool: "cheap-module-source-map",
	module: {
		rules: [
			{
				test: /(\.js)$/,
				exclude: /(node_modules)/,
				use: {
					loader: "babel-loader",
					options: {
						presets: ["@babel/preset-env"]
					}
				},
			},
			{
				test: /(\.js)$/,
				loader: StringReplacePlugin.replace({
					replacements: [{
						pattern: /#__VERSION__#/ig,
						replacement: () => pkg.version
					}]
				})
			}
		]
	},
	plugins: [
		new StringReplacePlugin(),
		new webpack.optimize.ModuleConcatenationPlugin(),
		new Stylish(),
		new WebpackBar()
	],
	stats: "minimal",
	mode: "none",
	devServer: {
		// https://github.com/webpack/webpack-dev-server/issues/1604
		disableHostCheck: true
	}
};

module.exports = () => {
	const env = process.env;
	let mode = "development";

	if (env.NODE_ENV) {
		mode = env.NODE_ENV;
	}

	env.MONITOR && config.plugins.push(
		new WebpackMonitor({
			launch: true
		})
	);

	if (env.NIGHTLY) {
		pkg.version = env.NIGHTLY;
	}

	if (env.VERSION) {
		pkg.version = env.VERSION;
	}

	mode === "packaged" && delete config.externals;

	return require(`./config/webpack.config.${mode}.js`)(config, env);
};
