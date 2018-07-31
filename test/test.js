const assert = require("assert");
const amf = require("../amf.js");
const RingBuffer = require("../ringBuffer.js");

describe("RingBuffer", function () {
    it("enq, deq", function () {
        const rb = new RingBuffer(10);
        rb.enq(5);
        assert.equal(rb.deq(), 5);
    });
    it("enq x2, deq x2", function () {
        const rb = new RingBuffer(10);
        rb.enq(5);
        rb.enq(20);
        assert.equal(rb.deq(), 5);
        assert.equal(rb.deq(), 20);
    });
    it("Circular q'ing", function () {
        const rb = new RingBuffer(6);
        rb.enq(2);
        rb.deq();
        rb.enq(3);
        rb.deq();
        for (let i = 0; i < 5; i++) {
            rb.enq(1);
        }
        assert.equal(rb.deq(), 1);
        assert.equal(rb.deq(), 1);
        assert.equal(rb.deq(), 1);
        assert.equal(rb.deq(), 1);
        assert.equal(rb.deq(), 1);
    });
    it("Overflow", function () {
        const rb = new RingBuffer(6);
        for (let i = 0; i < 5; i++) {
            rb.enq(1);
        }
        assert.throws(() => rb.enq(1), "Buffer Overflow");
    });
});
