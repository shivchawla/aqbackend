process.stdin.resume();

function exitHandler(err, options) {
    if (err) {
        console.log(err.stack);
    }
    if (options.cleanup) {
        console.log('clean');
    }
    if (options.exit) {
        console.log('bye bye!');
        process.exit();
    }
}

process.on('exit', exitHandler.bind(null, {cleanup: true}));
process.on('SIGINT', exitHandler.bind(null, {exit: true}));
process.on('uncaughtException', exitHandler.bind(new Error('ERROR'), {exit: true}));
