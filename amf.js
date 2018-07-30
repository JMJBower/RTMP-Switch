exports.processPacket = (packet) => {
    let data = {
        "data": packet,
        "p": 0,
        "readInt": function (len) {
            let num = 0;
            if (len == 2) num = this.data.readUInt16LE(this.p);
            else if (len == 4) num = this.data.readInt32BE(this.p);
            this.p += len;
            return num;
        },
        "readBin": function (len) {
            let str = this.data.slice(this.p, this.p + len - 1).toString();
            this.p += len;
            return str;
        }
    };

    let msg = {};

    msg.version = data.readInt(2);
    msg.headerCount = data.readInt(2);
    msg.headerTypeStructure = data.readBin(data.headerCount * 7);
    msg.messageCount = data.readInt(2);
    msg.messageTypeStructure = data.readBin(data.messageCount * 8);

    console.log(msg);
    console.log(packet.toString('hex'));

    return msg;
};
