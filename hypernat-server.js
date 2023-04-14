// hypernat-server.js

require('dotenv').config();

const crypto = require('crypto');
const Keychain = require('keypear');
const DHT = require("@hyperswarm/dht");
const pump = require("pump");
var net = require("net");
const udp = require('dgram');

const options = {
    "schema": [
        {
            "mode": "server",
            "proto": process.env.PROTO || "tcp",
            "port": process.env.PORT || '3000',
            "host": process.env.HOST || '0.0.0.0',
            "secret": process.env.SECRET || generateKey()
        }    
    ]
}

function generateKey() {
  const buf = crypto.randomBytes(32);
  return buf.toString('hex');
}

const { base58_to_binary, binary_to_base58 } = require('base58-js')
const relay = async () => {
    const node = new DHT({});
    await node.ready();
    return {
        tcp: {
            server: async (keyPair, port, host) => {
                const server = node.createServer({ reusableSocket: true });
                server.on("connection", function (servsock) {
                    console.log('New HyperNAT connection, relaying to ' + port);
                    var socket = net.connect({port, host, allowHalfOpen: true });
                    pump(servsock, socket, servsock);
                });

                console.log('\033[31;1;4m[Hyper NAT Server]\033[0m is listening for Client connections on tcp', port);;
                server.listen(keyPair);
            }
        },
        udp: {
            server: async (keyPair, port, host) => {
                const server = node.createServer();
                server.on("connection", function (conn) {
                    console.log('New HyperNAT connection, relaying to ' + port);
                    var client = udp.createSocket('udp4');
                    client.connect(port, host);
                    client.on('message', (buf) => {
                        conn.rawStream.send(buf);
                    })
                    conn.rawStream.on('message', function (buf) {
                        client.send(buf);
                    })
                });
                console.log('\033[31;1;4m[Hyper NAT Server]\033[0m is listening for Client connections on udp', port);
                await server.listen(keyPair);
            },
        }
    }
}

const schema = options.schema;

const modes = {
    server: async (settings) => {
        const {proto, port, host, secret} = settings;
        const hash = DHT.hash(Buffer.from(secret));
        const kp = DHT.keyPair(hash);
        console.log('\u001b[32mYOUR PUBLIC KEY FOR THIS SESSION:\033[0m', binary_to_base58(kp.publicKey));
        const rel = await relay();
        const keys = new Keychain(kp);
        const keyPair = keys.get(proto + port);
        (rel)[proto].server(keyPair, port, host);
    }
}
const run = async () => {
    console.log('[HyperNAT Server] is starting ...');
    for (forwarder of schema) {
        await modes[forwarder.mode](forwarder);
    }

}
run()

