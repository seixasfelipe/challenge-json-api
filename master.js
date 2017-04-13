const httpHelper = require('./httpHelper.js')
const utils = require('./utils.js')

let hashQueue = []
    secret = '',
    visited = [],
    secretArray = [],
    hostname = '',
    idleWorkers = [],
    cluster = null,
    maxWorkers = 0

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

function tryResolveNextSteps(jsonObj, newOrder) {
    let next = [], nextProp = undefined
    
    // Used to solve next, NEXT, NeXt, NeXT, etc property
    nextProp = jsonObj.readPropertyCaseInsensitive('next')
    
    if (typeof jsonObj[nextProp] === 'object') {
        jsonObj[nextProp].forEach((n,i) => next.push({ hash: n, order: newOrder(i) }))
    } else if (typeof jsonObj[nextProp] === 'string') {
        next.push({ hash: jsonObj[nextProp], order: newOrder(0) })
    }

    hashQueue = hashQueue.concat(next)
}

function markAsVisited(jsonObj) {
    if (typeof jsonObj.id === 'string') visited[jsonObj.id] = true
}

function tryResolveSecret(msg) {
    if (msg.json.secret) secretArray.push({ order: msg.order, secret: msg.json.secret })
}

function putWorkerToIdleList(id) {
    if (id) idleWorkers.push(id)
}

function followNextStepOrShowMeTheSecret(msg) {

    while(idleWorkers.length > 0 && hashQueue.length > 0) {

        let hash = hashQueue.splice(0, 1)
        if(hash.length === 0 || visited[hash[0].hash] === true) continue;

        let workerId = idleWorkers.splice(0, 1)
        if (workerId.length > 0) {
            // notify worker: here's a job to do 
            cluster.workers[workerId[0]].send({ id: workerId[0], hash: hash[0], session: msg.session })
        }
    }

    console.log(`idleWorkers.length: ${idleWorkers.length}, maxWorkers: ${maxWorkers}, hashQueue.length: ${hashQueue.length}`)

    if (idleWorkers.length === maxWorkers && hashQueue.length === 0) {

        const secretCompare = function secretCompare(a, b) {
            if (a.order < b.order) return -1
            if (a.order > b.order) return 1
            return 0
        }

        // secretArray.forEach((s) => console.log(`${s.order} : ${s.secret}`))
        secretArray.sort(secretCompare).forEach((s) => secret += s.secret)
        console.log(`secret is: ${secret}`)
        process.exit(1);
    }
}

function messageHandler(msg) {

    let newOrder = function(index) {
        return msg.order + msg.json.depth.toString() + index.toString()
    }

    tryResolveNextSteps(msg.json, newOrder)

    tryResolveSecret(msg)
        
    markAsVisited(msg.json)    

    putWorkerToIdleList(msg.id)
    
    followNextStepOrShowMeTheSecret(msg)
}


function configureWorkers(clusterObj, numWorkers, callback) {
 
    let workerEnv = {
        "HOSTNAME": hostname 
    }

    cluster = clusterObj
    maxWorkers = numWorkers
    
    // Multiple workers
    for (let i = 0; i < numWorkers; i++) {
        var worker = cluster.fork(workerEnv)
        worker.on('message', messageHandler)
        putWorkerToIdleList(worker.id)
    }

    callback()
}


exports.configureWorkers = configureWorkers
exports.getSession = getSession
exports.messageHandler = messageHandler

exports.setHostname = function(host) {
    hostname = host
}