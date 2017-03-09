var http = require('http'),
    hostname

function httpRequest(params, callback) {
    var options = {
        hostname: hostname,
        path: params.path,
        method: 'GET'
    }

    if(params.session) {
        options.headers = {
            'Session': params.session
        }
    }

    var req = http.request(options, (res) => {
        res.on('data', (chunk) => {
            console.log(`BODY: ${chunk}`)
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

function getSession() {

    httpRequest({ path: '/get-session' }, function(res) {
        console.log('callback ' + res)
        var json = JSON.parse(res)
        console.log(json.session)
    })
}


(function() {
    hostname = process.argv[2]
    getSession()
})()
