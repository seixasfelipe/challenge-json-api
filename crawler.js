const cluster = require('cluster')
const fs = require('fs')
const numCPUs = require('os').cpus().length
const httpHelper = require('./httpHelper.js')
let hashQueue = []
    secret = '',
    idleWorkers = [],
    visited = [],
    secretArray = [],
    hostname = ''

function processHash(hash, session, callback) {

    httpHelper.httpRequest({ path: '/' + hash, session: session, hostname: hostname }, function(res) {
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

        httpHelper.httpRequest({ path: '/get-session', hostname: hostname }, function(res) {
            let json = JSON.parse(res), session = json.session

            httpHelper.httpRequest({ path: '/start', session: session, hostname: hostname }, function(res) {
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

        if(!msg.json.hasOwnProperty('next') && !msg.json.hasOwnProperty('NeXt') && !msg.json.hasOwnProperty('secret')) {
            console.warn(`Can't find next, NeXt or secret properties`)
            console.log(msg.json)
        }

        // Decode message json object (secret, next steps, id, etc)
        if (msg.json.secret) secretArray.push({ order: msg.order, secret: msg.json.secret })
        if (typeof msg.json.next === 'object') msg.json.next.forEach((n,i) => hashQueue.push({ hash: n, order: newOrder(i) }))
        if (typeof msg.json.next === 'string') hashQueue.push({ hash: msg.json.next, order: newOrder(0) })
        if (typeof msg.json.NeXt === 'object') msg.json.NeXt.forEach((n,i) => hashQueue.push({ hash: n, order: newOrder(i) }))
        if (typeof msg.json.NeXt === 'string') hashQueue.push({ hash: msg.json.NeXt, order: newOrder(0) })
        if (typeof msg.json.id === 'string') visited[msg.json.id] = true

        // Put current worker in the idle worker list
        if (msg.id) idleWorkers.push(msg.id)
        
        // Search new job to workers
        while(idleWorkers.length > 0 && hashQueue.length > 0) {

            let hash = hashQueue.splice(0, 1)
            if(hash.length === 0 || visited[hash[0].hash] === true) continue;

            let workerId = idleWorkers.splice(0, 1)
            if (workerId.length > 0) {
                // notify worker: here's job to do 
                cluster.workers[workerId[0]].send({ id: workerId[0], hash: hash[0], session: msg.session })
            }
        }

        if (idleWorkers.length === numCPUs && hashQueue.length === 0) {
            // secretArray.forEach((s) => console.log(`${s.order} : ${s.secret}`))
            secretArray.sort(secretCompare).forEach((s) => secret += s.secret)
            console.log(`secret is: ${secret}`)
            process.exit(1);
        }

    }

    let workerEnv = {
        "HOSTNAME": hostname 
    }
    
    for (let i = 0; i < numCPUs; i++) {
        cluster.fork(workerEnv);
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
    hostname = process.env['HOSTNAME']

    process.on('message', (msg) => {

        processHash(msg.hash.hash, msg.session, (json) => {
            // fs.appendFile(`output-worker0${msg.id}.tmp`, JSON.stringify(json) + '\n');
            // notify master: result
            process.send({ json: json, session: msg.session, id: msg.id, order: msg.hash.order })
        })  
    })
}
