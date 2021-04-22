/*
 * Simple script for running emcc on ARToolKit
 * @author zz85 github.com/zz85
 * @author ThorstenBux github.com/ThorstenBux
 * @author Carnaux github.com/Carnaux
 */


var
	exec = require('child_process').exec,
	path = require('path'),
	fs = require('fs'),
	os = require('os'),
	child;

const platform = os.platform();

var NO_LIBAR = false;

var arguments = process.argv;

for (var j = 2; j < arguments.length; j++) {
	if (arguments[j] == '--no-libar') {
		NO_LIBAR = true;
		console.log('Building jsartoolkit5 with --no-libar option, libar will be preserved.');
	};
}

var HAVE_NFT = 1;

var EMSCRIPTEN_ROOT = process.env.EMSCRIPTEN;
var ORB2_ROOT = process.env.ORB2_ROOT || path.resolve(__dirname, "../emscripten/");

if (!EMSCRIPTEN_ROOT) {
  console.log("\nWarning: EMSCRIPTEN environment variable not found.")
  console.log("If you get a \"command not found\" error,\ndo `source <path to emsdk>/emsdk_env.sh` and try again.");
}

var EMCC = 'emcc';
var EMPP = 'em++';
var OPTIMIZE_FLAGS = ' -Oz '; // -Oz for smallest size
var MEM = 256 * 1024 * 1024; // 64MB


var SOURCE_PATH = path.resolve(__dirname, '../emscripten/') + '/';
var OUTPUT_PATH = path.resolve(__dirname, '../build/') + '/';

var BUILD_DEBUG_FILE = 'orb2.debug.js';
var BUILD_WASM_FILE = 'orb2_wasm.js';
var BUILD_MIN_FILE = 'orb2.min.js';

var MAIN_SOURCES = [
	'mono_kitti.cc'
];

MAIN_SOURCES = MAIN_SOURCES.map(function(src) {
  return path.resolve(SOURCE_PATH, src);
}).join(' ');

let orb_sources, dbow2_sources, g2o_sources;

orb_sources = [
    'Converter.cc',
    'Frame.cc',
    'FrameDrawer.cc',
    'Initializer.cc',
    'KeyFrame.cc',
    'KeyFrameDatabase.cc',
    'LocalMapping.cc',
    'LoopClosing.cc',
    'Map.cc',
    'MapDrawer.cc',
    'MapPoint.cc',
    'Optimizer.cc',
    'ORBextractor.cc',
    'ORBmatcher.cc',
    'PnPsolver.cc',
    'Sim3Solver.cc',
    'System.cc',
    'Tracking.cc',
    'Viewer.cc'
].map(function(src) {
    return path.resolve(__dirname, ORB2_ROOT + '/Orb2/src/', src);
});

dbow2_sources = [
    'BowVector.cpp',
    'FeatureVector.cpp',
    'FORB.cpp',
    'ScoringObject.cpp',
    'DUtils/Random.cpp',
    'DUtils/Timestamp.cpp'
].map(function(src) {
    return path.resolve(__dirname, ORB2_ROOT + '/DBoW2/', src);
});

g2o_sources = [
    'core/batch_stats.cpp',
    'core/cache.cpp',
    'core/estimate_propagator.cpp',
    'core/factory.cpp',
    'core/hyper_dijkstra.cpp',
    'core/hyper_graph_action.cpp',
    'core/hyper_graph.cpp',
    'core/jacobian_workspace.cpp',
    'core/marginal_covariance_cholesky.cpp',
    'core/matrix_structure.cpp',
    'core/optimizable_graph.cpp',
    'core/optimization_algorithm_dogleg.cpp',
    'core/optimization_algorithm_factory.cpp',
    'core/optimization_algorithm_gauss_newton.cpp',
    'core/optimization_algorithm_levenberg.cpp',
    'core/optimization_algorithm_with_hessian.cpp',
    'core/optimization_algorithm.cpp',
    'core/parameter_container.cpp',
    'core/parameter.cpp',
    'core/robust_kernel_factory.cpp',
    'core/robust_kernel_impl.cpp',
    'core/robust_kernel.cpp',
    'core/solver.cpp',
    'core/sparse_block_matrix_test.cpp',
    'core/sparse_optimizer.cpp',
    'stuff/os_specific.c',
    'stuff/property.cpp',
    'stuff/string_tools.cpp',
    'stuff/timeutil.cpp',
    'types/types_sba.cpp',
    'types/types_seven_dof_expmap.cpp',
    'types/types_six_dof_expmap.cpp',
].map(function(src) {
    return path.resolve(__dirname, ORB2_ROOT + '/g2o/', src);
});

orb_sources = orb_sources
.concat(dbow2_sources)
.concat(g2o_sources);

var DEFINES = ' ';

var FLAGS = '' + OPTIMIZE_FLAGS;
// FLAGS += ' -stdlib=libstdc++ '
FLAGS += ' -Wno-warn-absolute-paths ';
FLAGS += ' -s TOTAL_MEMORY=' + MEM + ' ';
FLAGS += ' -s USE_ZLIB=1';
FLAGS += ' -s USE_LIBJPEG';
FLAGS += ' --memory-init-file 0 '; // for memless file
FLAGS += ' -s ALLOW_MEMORY_GROWTH=1';

var WASM_FLAGS = ' -s BINARYEN_TRAP_MODE=clamp'

// var PRE_FLAGS = ' --pre-js ' + path.resolve(__dirname, '../js/artoolkit.api.js') +' ';
var PRE_FLAGS = ' ';

FLAGS += ' --bind ';

/* DEBUG FLAGS */
var DEBUG_FLAGS = ' -g ';
DEBUG_FLAGS += ' -s ASSERTIONS=1 '
DEBUG_FLAGS += ' --profiling '
DEBUG_FLAGS += ' -s ALLOW_MEMORY_GROWTH=1';
DEBUG_FLAGS += '  -s DEMANGLE_SUPPORT=1 ';

// TO DO CHECK OS AND 32-64 AND ASSIGN CORRESPONDING OPENCV FOLDER

var INCLUDES = [
    path.resolve(__dirname, ORB2_ROOT + '/Orb2/include/'),
    path.resolve(__dirname, ORB2_ROOT + '/DBoW2/'),
    // path.resolve(__dirname, ORB2_ROOT + '/DBoW2/DUtils/'),
    path.resolve(__dirname, ORB2_ROOT + '/g2o/'),
    // path.resolve(__dirname, ORB2_ROOT + '/g2o/core/'),
    // path.resolve(__dirname, ORB2_ROOT + '/g2o/solvers/'),
    // path.resolve(__dirname, ORB2_ROOT + '/g2o/stuff/'),
    // path.resolve(__dirname, ORB2_ROOT + '/g2o/types/'),
    path.resolve(__dirname, ORB2_ROOT + '/opencv/linux-x86_64/'),
    path.resolve(__dirname, ORB2_ROOT + '/Eigen/'),
    OUTPUT_PATH,
    SOURCE_PATH,
].map(function(s) { return '-I' + s }).join(' ');

function format(str) {
    for (var f = 1; f < arguments.length; f++) {
        str = str.replace(/{\w*}/, arguments[f]);
    }
    return str;
}

function clean_builds() {
    try {
        var stats = fs.statSync(OUTPUT_PATH);
    } catch (e) {
        fs.mkdirSync(OUTPUT_PATH);
    }

    try {
        var files = fs.readdirSync(OUTPUT_PATH);
				var filesLength = files.length;
        if (filesLength > 0)
				if (NO_LIBAR == true){
					filesLength -= 1;
				}
            for (var i = 0; i < filesLength; i++) {
                var filePath = OUTPUT_PATH + '/' + files[i];
                if (fs.statSync(filePath).isFile())
                    fs.unlinkSync(filePath);
            }
    }
    catch(e) { return console.log(e); }
}

var compile_orblib = format(EMCC + ' ' + INCLUDES + ' '
    + orb_sources.join(' ')
    + FLAGS + ' ' + DEFINES + ' -o {OUTPUT_PATH}libOrb.bc ',
    OUTPUT_PATH);

var ALL_BC = " {OUTPUT_PATH}libOrb.bc ";

var compile_combine = format(EMCC + ' ' + INCLUDES + ' '
    + ALL_BC + MAIN_SOURCES
    + FLAGS + ' -s WASM=0' + ' '  + DEBUG_FLAGS + DEFINES + PRE_FLAGS + ' -o {OUTPUT_PATH}{BUILD_FILE} ',
    OUTPUT_PATH, OUTPUT_PATH, BUILD_DEBUG_FILE);

var compile_combine_min = format(EMCC + ' ' + INCLUDES + ' '
    + ALL_BC + MAIN_SOURCES
    + FLAGS + ' -s WASM=0' + ' ' + DEFINES + PRE_FLAGS + ' -o {OUTPUT_PATH}{BUILD_FILE} ',
    OUTPUT_PATH, OUTPUT_PATH, BUILD_MIN_FILE);

var compile_wasm = format(EMCC + ' ' + INCLUDES + ' '
    + ALL_BC + MAIN_SOURCES
    + FLAGS + WASM_FLAGS + DEFINES + PRE_FLAGS + ' -o {OUTPUT_PATH}{BUILD_FILE} ',
    OUTPUT_PATH, OUTPUT_PATH, BUILD_WASM_FILE);

/*
 * Run commands
 */

function onExec(error, stdout, stderr) {
    if (stdout) console.log('stdout: ' + stdout);
    if (stderr) console.log('stderr: ' + stderr);
    if (error !== null) {
        console.log('exec error: ' + error.code);
        process.exit(error.code);
    } else {
        runJob();
    }
}

function runJob() {
    if (!jobs.length) {
        console.log('Jobs completed');
        return;
    }
    var cmd = jobs.shift();

    if (typeof cmd === 'function') {
        cmd();
        runJob();
        return;
    }

    console.log('\nRunning command: ' + cmd + '\n');
    exec(cmd, onExec);
}

var jobs = [];

function addJob(job) {
    jobs.push(job);
}

addJob(clean_builds);
addJob(compile_orblib);
addJob(compile_combine);
addJob(compile_wasm);
// addJob(compile_combine_min);

if (NO_LIBAR == true){
  jobs.splice(1,1);
}

runJob();
