const cluster = require('cluster')
const http = require('http')
const fs = require('fs')
const numCPUs = require('os').cpus().length
let hostname,
    hashQueue = []
    secret = '',
    idleWorkers = [],
    visited = [],
    secretArr = []

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

function processHash(hash, session, callback) {

    httpRequest({ path: '/' + hash, session: session }, function(res) {
        let json = JSON.parse(res)
        if(callback) {
            callback(json)
        }
    })
}

function secretCompare(a, b) {
    if (a.order < b.order) return -1
    if (a.order > b.order) return 1
    return 0
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

        let newOrder = function(index) {
            return msg.order + msg.json.depth.toString() + index.toString()
        }

        if (msg.json.secret) secretArr.push({ order: msg.order, secret: msg.json.secret })
        if (typeof msg.json.next === 'object') msg.json.next.forEach((n,i) => hashQueue.push({ hash: n, order: newOrder(i) }))
        if (typeof msg.json.next === 'string') hashQueue.push({ hash: msg.json.next, order: newOrder(0) })
        if (typeof msg.json.id === 'string') visited[msg.json.id] = true

        if (msg.id) idleWorkers.push(msg.id)
        
        while(idleWorkers.length > 0 && hashQueue.length > 0) {

            let hash = hashQueue.splice(0, 1)
            if(hash.length === 0 || visited[hash[0].hash] === true) continue;

            let workerId = idleWorkers.splice(0, 1)
            if (workerId.length > 0) {
                // notify worker: here's job to do 
                cluster.workers[workerId[0]].send({ id: workerId[0], hash: hash[0], session: msg.session, hostname: hostname })
            }
        }

        if (idleWorkers.length === numCPUs && hashQueue.length === 0) {
            secretArr.forEach((s) => console.log(`${s.order} : ${s.secret}`))
            secretArr.sort(secretCompare).forEach((s) => secret += s.secret)
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
            // fs.appendFile(`output-master.tmp`, JSON.stringify(json) + '\n');

            msgHandler({ json: json, session: session, order: '0' })
        })
    })()
}
else {
    process.on('message', (msg) => {

        hostname = msg.hostname
        processHash(msg.hash.hash, msg.session, (json) => {
            // fs.appendFile(`output-worker0${msg.id}.tmp`, JSON.stringify(json) + '\n');
            // notify master: result
            process.send({ json: json, session: msg.session, id: msg.id, order: msg.hash.order })
        })  
    })
}
