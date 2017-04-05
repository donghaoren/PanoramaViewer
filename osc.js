let osc = require("node-osc");

let ip = "127.0.0.1";
let port = 3333;

let client = new osc.Client(ip, port);

client.send(...process.argv.slice(2), () => {
    // Stop the client after the message is sent, otherwise process will not exit.
    client.kill();
});