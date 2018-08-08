// RTMP Multiplexer
const net = require("net");
const RingBuffer = require("./ringBuffer.js");

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

/**
 *
 */
class EventRingBuffer extends RingBuffer {
    /**
     *
     * @param {*} size Buffer size
     */
    constructor(size) {
        super(size);
        this.cb = null;
    }

    /**
     * Binds a callback to new data being enqueued in the buffer
     * @param {Function} cb
     */
    bind(cb) {
        this.cb = cb;
    }

    /**
     * @param {*} toEnq
     */
    enq(toEnq) {
        super.enq(toEnq);
        if (this.cb) this.cb();
    }
}

const server = net.createServer((socket) => {
    socket.name = socket.remoteAddress + ":" + socket.remotePort;

    // Progress throught the handshaking process
    socket.handshake = 0;

    socket.currPacket = null;
    socket.currPointer = null;

    // Data on the socket to be proccessed
    socket.toProccess = new EventRingBuffer();
    socket.toProccess.bind(() => {
        let elm = null;
        while ((elm = socket.toProccess.deq()) != null) {
            if (socket.handshake == 0) {
                if (elm != 3) throw new Error("Invalid Handshake");
                socket.handshake++;
            } else if (socket.handshake == 1) {
                if (Buffer.isBuffer(socket.currPacket)) {
                    // Element is a part of the current RTMP packet
                    socket.currPacket.writeUInt8(elm, socket.currPointer++);
                    if (socket.currPointer == 1536) {
                        // We have the complete handshake packet
                        socket.s1 = randBytes();
                        socket.c1 = socket.currPacket;
                        socket.currPacket = null;
                        socket.write(Buffer.from([0x03]));
                        socket.write(socket.s1);
                        socket.handshake++;
                    }
                } else if (!Buffer.isBuffer(socket.currPacket)) {
                    // Start of a new RTMP packet
                    socket.currPacket = Buffer.alloc(1536);
                    socket.currPointer = 0;
                    socket.currPacket.writeUInt8(elm, socket.currPointer++);
                }
            } else if (socket.handshake == 2) {
                if (Buffer.isBuffer(socket.currPacket)) {
                    // Element is a part of the current RTMP packet
                    socket.currPacket.writeUInt8(elm, socket.currPointer++);
                    if (socket.currPointer == 1536) {
                        // We have the complete handshake packet
                        console.log(socket.currPacket.toString("hex"));
                        console.log(socket.s1.toString("hex"));
                        if (!socket.currPacket.equals(socket.s1)) throw new Error("S1 doesn't match");
                        socket.currPacket = null;
                        socket.write(socket.c1);
                        socket.handshake++;
                    }
                } else if (!Buffer.isBuffer(socket.currPacket)) {
                    // Start of a new RTMP packet
                    socket.currPacket = Buffer.alloc(1536);
                    socket.currPointer = 0;
                    socket.currPacket.writeUInt8(elm, socket.currPointer++);
                }
            } else if (socket.handshake == 3) {
                // Handshake complete
                const headerStruc = [
                    "chunkHeaderType",
                    "timeStampDelta", "timeStampDelta", "timeStampDelta",
                    "packetLength", "packetLength", "packetLength",
                    "messageTypeId",
                    "messageStreamId", "messageStreamId", "messageStreamId",
                    "messageStreamId"
                ];

                if (socket.currPacket == null) {
                    // New message
                    socket.currPointer = 0;
                    socket.currPacket = {};

                    // Basic Header
                    socket.currPacket.chunkHeaderType = elm & 0xC0;
                    socket.currPacket.chunkHeaderType >>>= 6;

                    socket.currPacket.chunkStreamId = elm & 0x3F;

                    if (socket.currPacket.chunkHeaderType == 0x00) {
                        socket.currPacket.buffer = Buffer.alloc(12);
                    } else if (socket.currPacket.chunkHeaderType == 0x01) {
                        socket.currPacket.buffer = Buffer.alloc(8);
                    } else if (socket.currPacket.chunkHeaderType == 0x02) {
                        socket.currPacket.buffer = Buffer.alloc(4);
                    } else if (socket.currPacket.chunkHeaderType == 0x03) {
                        socket.currPacket.buffer = Buffer.alloc(1);
                    }
                    socket.currPacket.header = {};
                }
                if (socket.currPacket.header[headerStruc[socket.currPointer]] != undefined) {
                    socket.currPacket.header[headerStruc[socket.currPointer]] *= 2;
                    socket.currPacket.header[headerStruc[socket.currPointer]] += elm;
                } else {
                    socket.currPacket.header[headerStruc[socket.currPointer]] = elm;
                }
                socket.currPacket.buffer.writeUInt8(elm, socket.currPointer++);
                if (socket.currPointer == socket.currPacket.buffer.length) {
                    // Header complete
                    console.log(socket.currPacket);
                }
            }
        }
    });

    clients[socket.name] = socket;

    socket.on("end", (d) => {
        clients[socket.name] = null;
    });

    socket.on("data", (data) => {
        socket.toProccess.enq(data);
    });
}).on("error", (err) => {
    // handle errors here
    throw err;
});


server.listen(PORT, () => {
    console.log("Opened server on", server.address());
});
