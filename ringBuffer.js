/**
 *
 */
class RingBuffer {
    /**
     *
     * @param {Integer} size Default 10,000
     */
    constructor(size) {
        this.size = size || 10000;
        this.buffer = Buffer.alloc(this.size);
        this.p = 0;
        this.front = 0;
    }

    /**
     * @param {*} toEnq Buffer or value to enqueue in the buffer
     */
    enq(toEnq) {
        if ((this.p + 1) % this.size == this.front) {
            throw new Error("Buffer overflow");
        }
        if (Buffer.isBuffer(toEnq)) {
            for (let i = 0; i < toEnq.length; i++) {
                this.enq(toEnq[i]);
            }
        } else {
            this.buffer.writeInt8(toEnq, this.p);
            this.p = (this.p + 1) % this.size;
        }
    }

    /**
     * @param {*} len Number of elements to dequeue from the buffer (Default 1)
     * @return {*} Returns the element if 1 or a buffer of 2 or more.
     */
    deq(len) {
        if (len > this.size) throw new Error("Length longer than buffer");
        if (len == 1 || !len) {
            if (this.front >= this.size) this.front = 0;
            return this.buffer.readInt8(this.front++);
        } else {
            const res = Buffer.alloc(len);
            for (let i = 0; i < len; i++) {
                res.writeInt8(this.deq(1));
            }
            return res;
        }
    }
}

module.exports = RingBuffer;
