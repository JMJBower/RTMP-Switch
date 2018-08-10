// RTMP Multiplexer
const net = require("net");
const AMF = require("amf-js");
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
 * Generates the header's and send the packet
 * @param {Socket} socket
 * @param {Buffer} body
 * @param {Number} typeId
 * @param {boolean} lowLevel
 */
function send(socket, body, typeId, lowLevel) {
    const packet = Buffer.alloc(body.length + 12);
    packet.writeUInt8(lowLevel ? 0x02 : 0x03, 0);
    packet.writeUIntBE(0x00, 1, 3);
    packet.writeUIntBE(body.length, 2, 3);
    packet.writeUInt8(typeId, 7);
    packet.writeUIntLE(0, 8, 4);

    for (let i = 0; i < body.length; i++) {
        packet.writeUInt8(body[i], i + 12);
    }
    console.log(packet);
    //socket.write(packet);
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

    socket.chunkSize = 128; // Default Chunk size

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
                    socket.handshake = 4;
                    socket.currPacket.buffer =
                        Buffer.alloc(socket.currPacket.header.packetLength);
                    socket.currPointer = 0;
                }
            } else if (socket.handshake == 4) {
                socket.currPacket.buffer.writeUInt8(elm, socket.currPointer++);
                let reply = null;
                if (socket.currPointer == socket.currPacket.buffer.length) {
                    console.log("Body Done");
                    // Body complete
                    switch (socket.currPacket.header.messageTypeId) {
                        case 0x01:
                            // Set Chunk Size
                            socket.chunkSize =
                                socket.currPacket.buffer.readUInt32BE(0);
                            console.log("New chunk size", socket.chunkSize);
                            break;
                        case 0x04:
                            // Ping Message
                            break;
                        case 0x05:
                            // Server Bandwidth
                            break;
                        case 0x06:
                            // Client Bandwidth
                            break;
                        case 0x08:
                            // Audio Packet
                            break;
                        case 0x09:
                            // Video Packet
                            break;
                        case 0x11:
                            // AMF3
                            break;
                        case 0x12:
                            // Invoke
                            break;
                        case 0x14:
                            // AMF0
                            console.log(socket.currPacket.buffer);
                            let buf = AMF.makeArrayBuffer(socket.currPacket.buffer.toString("hex"));
                            console.log(AMF.deserialize(buf));
                            //if (decoder == "connect") {
                                // Send Client Bandwidth
                                reply = Buffer.alloc(4);
                                reply.writeInt32BE(5000, 0);
                                send(socket, reply, 0x06, true);
                                // Send Server Bandwidth
                                send(socket, reply, 0x05, true);
                                // Send Invoke
                                
                                //reply = amf.write("_result");
                                send(socket, reply, 0x14, false);
                            //}
                            break;
                        default:
                            throw new Error("Invalid Message Type ID");
                    }

                    console.log(socket.currPacket);
                    // End of Packet, setup for a new packet
                    socket.handshake = 3;
                    socket.currPacket = null;
                    socket.currPointer = 0;
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
