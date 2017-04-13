const cluster = require('cluster')
// const fs = require('fs')
const numCPUs = require('os').cpus().length
const httpHelper = require('./httpHelper.js')

let hostname = ''

if (cluster.isMaster) {

    hostname = process.argv[2]

    const master = require('./master.js')

    ;(function() {

        master.setHostname(hostname)
        master.configureWorkers(cluster, numCPUs, () => {

            master.getSession((json, session) => {
                // fs.appendFile(`output-master.tmp`, JSON.stringify(json) + '\n');

                master.messageHandler({ json: json, session: session, order: '0' })
            })

        })
    })()

} else {
    hostname = process.env['HOSTNAME']

    function processHash(hash, session, callback) {

        httpHelper.httpRequest({ path: '/' + hash, session: session, hostname: hostname }, function(res) {
            let json = JSON.parse(res)
            
            if(callback) callback(json)
        })
    }

    process.on('message', (msg) => {

        processHash(msg.hash.hash, msg.session, (json) => {
            // fs.appendFile(`output-worker0${msg.id}.tmp`, JSON.stringify(json) + '\n');
            // notify master: result
            process.send({ json: json, session: msg.session, id: msg.id, order: msg.hash.order })
        })  
    })
}
