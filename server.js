// RTMP Multiplexer
const amf = require("./amf.js");
const net = require("net");

const PORT = 1935;

const clients = {};

/**
 * Generate random bytes
 * @return {Buffer} buffer of bytes
 */
function randBytes() {
    let numbers = new Array(1536);
    for (let i = 0; i < numbers.length; i++) {
        numbers[i] = Math.floor(Math.random() * (255 + 1));
    }
    return Buffer.from(numbers);
}

const server = net.createServer((socket) => {
    socket.name = socket.remoteAddress + ":" + socket.remotePort;
    socket.handshake = 0;
    clients[socket.name] = socket;

    socket.on("end", (d) => {
        clients[socket.name] = null;
    });

    socket.on("data", (data) => {
        // console.log(data)
        if (socket.handshake == 2) {
            amf.processPacket(data);
        } else if (socket.handshake == 0) {
            if (data[0] != 0x03) throw new Error("Invalid Initialisation");
            socket.c1 = data.slice(1, 1537);
            socket.s1 = randBytes();
            socket.write(Buffer.from([0x03]));
            socket.write(socket.s1);
            socket.handshake++;
        } else if (socket.handshake == 1) {
            if (!data.equals(socket.s1)) throw new Error("Wrong rand bytes");
            socket.write(socket.c1);
            socket.handshake++;
        }
    });
}).on("error", (err) => {
    // handle errors here
    throw err;
});


server.listen(PORT, () => {
    console.log("opened server on", server.address());
});
