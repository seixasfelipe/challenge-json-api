const cluster = require('cluster')
const http = require('http')
const fs = require('fs')
const numCPUs = require('os').cpus().length
let hostname,
    hashQueue = []
    secret = '',
    idleWorkers = [],
    visited = []

function httpRequest(params, callback) {
    let options = {
        hostname: hostname,
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
            fs.appendFile('output.tmp', chunk + '\n');

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

function processHash(hash, session, callback) {

    httpRequest({ path: '/' + hash, session: session }, function(res) {
        let json = JSON.parse(res)
        if(callback) {
            callback(json)
        }
    })
}

function appendSecret(s) {
    secret += s
    console.log(secret)
}

if (cluster.isMaster) {

    hostname = process.argv[2]

    function getSession(callback) {

        httpRequest({ path: '/get-session' }, function(res) {
            let json = JSON.parse(res), session = json.session

            httpRequest({ path: '/start', session: session }, function(res) {
                let json = JSON.parse(res)
                if(callback) {
                    callback(json, session)
                }
            })
        })
    }

    function msgHandler(msg) {

        if (msg.json.secret) appendSecret(msg.json.secret)
        if (typeof msg.json.next === 'object') hashQueue = hashQueue.concat(msg.json.next)
        if (typeof msg.json.next === 'string') hashQueue.push(msg.json.next)
        if (typeof msg.json.id === 'string') visited[msg.json.id] = true

        if (msg.id) idleWorkers.push(msg.id)
        
        while(idleWorkers.length > 0 && hashQueue.length > 0) {

            let hash = hashQueue.splice(0, 1)
            if(hash.length === 0 || visited[hash[0]] === true) continue;

            let workerId = idleWorkers.splice(0, 1)
            if (workerId.length > 0) {
                // notify worker: here's job to do 
                cluster.workers[workerId[0]].send({ id: workerId[0], hash: hash[0], session: msg.session, hostname: hostname })
            }
        }

        if (idleWorkers.length === numCPUs && hashQueue.length === 0) {
            console.log(`secret is: ${secret}`)
        }

    }
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    for (const id in cluster.workers) {
        cluster.workers[id].on('message', msgHandler);
        idleWorkers.push(id)
    }

    (function() {
        getSession((json, session) => {
            msgHandler({ json: json, session: session })
        })
    })()
}
else {
    process.on('message', (msg) => {

        hostname = msg.hostname
        processHash(msg.hash, msg.session, (json) => {
            // notify master: result
            process.send({ json: json, session: msg.session, id: msg.id })
        })  
    })
}
