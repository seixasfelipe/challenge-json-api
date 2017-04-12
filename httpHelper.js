const http = require('http')

function httpRequest(params, callback) {
    let options = {
        hostname: params.hostname,
        path: params.path,
        method: 'GET'
    }

    if(params.session) {
        options.headers = {
            'Session': params.session
        }
    }

    // console.log(`=> new request ${options.path}`)

    let req = http.request(options, (res) => {
        res.on('data', (chunk) => {
            // console.log(`response: ${chunk}`)
            // fs.appendFile('output.tmp', chunk + '\n');

            if(callback) {
                callback(chunk)
            }
        })
    })

    req.on('error', (e) => {
        console.log(`problem with request: ${e.message}`)
    })

    req.end();
}

exports.httpRequest = httpRequest