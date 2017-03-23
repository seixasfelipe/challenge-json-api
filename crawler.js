var http = require('http'),
    hostname,
    hashQueue = []
    secret = ''

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

    console.log(`=> new request ${options.path}`)

    var req = http.request(options, (res) => {
        res.on('data', (chunk) => {
            console.log(`response: ${chunk}`)
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

function processHash(json, session) {

    if (json.secret) secret += json.secret
    if (typeof json.next === 'object') hashQueue = hashQueue.concat(json.next)
    if (typeof json.next === 'string') hashQueue.push(json.next)

    var hash = hashQueue.splice(0, 1)

    if (hash.length === 0) console.log(`secret is: ${secret}`)

    httpRequest({ path: '/' + hash[0], session: session }, function(res) {
        var json = JSON.parse(res)
        processHash(json, session)
    })
}

function getSession() {

    httpRequest({ path: '/get-session' }, function(res) {
        var json = JSON.parse(res), session = json.session

        httpRequest({ path: '/start', session: session }, function(res) {
            var json = JSON.parse(res)
            processHash(json, session)
        })
    })
}


(function() {
    hostname = process.argv[2]
    getSession()
})()
