/**
 * A wrapper for Thorsten Joachims' SVM-perf package
 * 
 * To use this wrapper, you must have SVM-perf installed, 
 * and must have its executables (svm_perf_learn, svm_perf_classify) in your path. 
 * 
 * You can download SVM-perf here: http://www.cs.cornell.edu/people/tj/svm_light/svm_perf.html
 * subject to the copyright license.
 *
 * @author Erel Segal-haLevi
 * @since 2013-09-02
 * 
 * @param opts options: <ul>
 *	<li>learn_args - a string with arguments for svm_perf_learn  (see http://www.cs.cornell.edu/people/tj/svm_light/svm_perf.html )
 *  <li>classify_args - a string with arguments for svm_perf_classify
 *  <li>model_file_prefix - prefix to path to model file.
 *  <li>continuous_output - if true, classify returns a numeric output; if false, it returns 0/1
 */

function SvmPerf(opts) {
	this.learn_args = opts.learn_args || "";
	this.classify_args = opts.classify_args || "";
	this.model_file_prefix = opts.model_file_prefix || null; //"svmperf-temp";
	this.continuous_output = opts.continuous_output || false;
	this.debug = opts.debug||false;
}

var temp = require('temp')
  , fs   = require('fs')
  , util  = require('util')
  , execSync = require('execSync').exec
  , exec = require('child_process').exec
  , svmlight = require('../../formats/svmlight')
  ;



SvmPerf.prototype = {
		trainOnline: function(features, expected) {
			throw new Error("SVM-perf does not support online training");
		},

		/**
		 * Send the given dataset to svm_perf_learn.
		 *
		 * @param dataset an array of samples of the form {input: [value1, value2, ...] , output: 0/1} 
		 */
		trainBatch: function(dataset) {
			if (this.debug) console.log("trainBatch start");
			var self = this;
			if (this.model_file_prefix) {
				var learnFile = this.model_file_prefix+".learn";
				var fd = fs.openSync(learnFile, 'w');
			} else {
				var tempFile = temp.openSync({prefix:'svmperf-',suffix:".learn"});
				var learnFile = tempFile.path;
				var fd = tempFile.fd;
			}
			fs.writeSync(fd, svmlight.toSvmLight(dataset));
			fs.closeSync(fd);

			self.modelFile = learnFile.replace(/[.]learn/,".model");
			var command = "svm_perf_learn "+self.learn_args+" "+learnFile + " "+self.modelFile;
			if (this.debug) console.log("running "+command);
	
			var result = execSync(command);
			if (result.code>0) {
				console.dir(result);
				console.log(fs.readFileSync(learnFile, 'utf-8'));
				throw new Error("cannot execute: "+command);
			}
			
			var modelString = fs.readFileSync(self.modelFile, "utf-8");
			this.modelMap = modelStringToModelMap(modelString);
			
			if (this.debug) console.dir(this.modelMap);
			if (this.debug) console.log("trainBatch end");
		},
		
		

		/**
		 * @param inputs - a feature-value hash.
		 * @param explain - int - if positive, an "explanation" field, with the given length, will be added to the result.  
		 * @return the binary classification - 0 or 1.
		 */
		classify: function(features, explain) {
			var score = classifyWithModelMap(features, this.modelMap);
			return this.continuous_output? score: (score>0? 1: 0);
		},
};


/*
 * UTILS
 */


var SVM_PERF_MODEL_PATTERN = new RegExp(
		//"(?s)"+  // single string option (. matches newline)
		//"(?m)"+  // multiline option (^ matches at start of line)
		"[\\S\\s]*"+    // skip the beginning of string
		"^([\\S\\s]*) # threshold b[\\S\\s]*"+  // parse the threshold line
		"^([\\S\\s]*) #[\\S\\s]*" + // parse the weights line
		"", "m");

/**
 * A utility that converts a model in the SVMPerf format to a map of feature weights.
 * @param modelString a string.
 * @returns a map.
 */
function modelStringToModelMap(modelString) {
	var matches = SVM_PERF_MODEL_PATTERN.exec(modelString);
	if (!matches) {
		console.log(modelString);
		throw new Error("Model does not match SVM-perf format");
	};
	var threshold = parseFloat(matches[1]);
	var featuresAndWeights = matches[2].split(" ");
	var mapFeatureToWeight = {};
	mapFeatureToWeight.threshold = threshold;
	//String alphaTimesY = featuresAndWeights[0]; // always 1 in svmperf
	for (var i=1; i<featuresAndWeights.length; ++i) {
		var featureAndWeight = featuresAndWeights[i];
		var featureWeight = featureAndWeight.split(":");
		if (featureWeight.length!=2)
			throw new Error("Model featureAndWeight doesn't match svm-perf pattern: featureAndWeight="+featureAndWeight);
		var feature = parseInt(featureWeight[0]);
		if (feature<=0)
			throw new IllegalArgumentException("Non-positive feature id: featureAndWeight="+featureAndWeight);
		var weight = parseFloat(featureWeight[1]);
		mapFeatureToWeight[feature-1]=weight;   // start feature values from 0
	}
	return mapFeatureToWeight;
}

/**
 * A utility that classifies a given sample (given as a feature-value map) using a model (given as a feature-weight map).
 * @param features a map {feature_i: value_i, ....} (i >= 1)
 * @param modelMap a map {threshold: threshold, feature_i: weight_i, ....} (i >= 1)
 * @returns a classification value.
 */
function classifyWithModelMap(features, modelMap) {
	if (!('threshold' in modelMap))
		throw new IllegalArgumentException("Model doesn't contain the thershold value! "+JSON.stringify(modelMap));
	
	var result = -modelMap.threshold;
	for (var feature in features) {
		if (feature in modelMap)
			result += modelMap[feature]*features[feature];
	}

	return result;
}


module.exports = SvmPerf;
