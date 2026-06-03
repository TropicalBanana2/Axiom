class Lxiv {
    constructor() {
        this.aout = [
            65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
            81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 97, 98, 99, 100, 101, 102,
            103, 104, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 117, 118,
            119, 120, 121, 122, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 43, 47
        ];
        this.ain = [];
        for (let i = 0; i < this.aout.length; ++i) this.ain[this.aout[i]] = i;
    }
    encode(src, dst) {
        let b, t;
        while ((b = src()) !== null) {
            dst(aout[(b >> 2) & 0x3f]);
            t = (b & 0x3) << 4;
            if ((b = src()) !== null) {
                t |= (b >> 4) & 0xf;
                dst(aout[(t | ((b >> 4) & 0xf)) & 0x3f]);
                t = (b & 0xf) << 2;
                if ((b = src()) !== null) dst(aout[(t | ((b >> 6) & 0x3)) & 0x3f]), dst(aout[b & 0x3f]);
                else dst(aout[t & 0x3f]), dst(61);
            } else dst(aout[t & 0x3f]), dst(61), dst(61);
        }
    }
    decode(src, dst) {
        let c, t1, t2;
        function fail(c) {
            throw Error(`Illegal character code: ${c}`);
        }
        while ((c = src()) !== null) {
            t1 = ain[c];
            if (typeof t1 === "undefined") fail(c);
            if ((c = src()) !== null) {
                t2 = ain[c];
                if (typeof t2 === "undefined") fail(c);
                dst((t1 << 2) >>> 0 | (t2 & 0x30) >> 4);
                if ((c = src()) !== null) {
                    t1 = ain[c];
                    if (typeof t1 === "undefined")
                    if (c === 61) break; else fail(c);
                    dst(((t2 & 0xf) << 4) >>> 0 | (t1 & 0x3c) >> 2);
                    if ((c = src()) !== null) {
                        t2 = ain[c];
                        if (typeof t2 === "undefined")
                        if (c === 61) break; else fail(c);
                        dst(((t1 & 0x3) << 6) >>> 0 | t2);
                    }
                }
            }
        }
    }
}

const lxiv = new Lxiv();

class Utfx {
    constructor() {
        this.MAX_CODEPOINT = 0x10FFFF;
    }
    encodeUTF8(src, dst) {
        let cp = null;
        if (typeof src === "number") cp = src, src = function() { 
            return null; 
        }
        while (cp !== null || (cp = src()) !== null) {
            if (cp < 0x80) dst(cp & 0x7F);
            else if (cp < 0x800) dst(((cp >> 6) & 0x1F) | 0xC0), dst((cp & 0x3F) | 0x80);
            else if (cp < 0x10000) dst(((cp >> 12) & 0x0F) | 0xE0), dst(((cp >> 6) & 0x3F) | 0x80), dst((cp & 0x3F) | 0x80);
            else dst(((cp >> 18) & 0x07) | 0xF0), dst(((cp >> 12) & 0x3F) | 0x80), dst(((cp >> 6) & 0x3F) | 0x80), dst((cp & 0x3F) | 0x80);
            cp = null;
        }
    }
    decodeUTF8(src, dst) {
        let a, b, c, d, fail = function (b) {
            b = b.slice(0, b.indexOf(null));
            const err = Error(b.toString());
            err.name = "TruncatedError";
            err["bytes"] = b;
            throw err;
        }
        while ((a = src()) !== null) {
            if ((a & 0x80) === 0) dst(a);
            else if ((a & 0xE0) === 0xC0) ((b = src()) === null) && fail([a, b]), dst(((a & 0x1F) << 6) | (b & 0x3F));
            else if ((a & 0xF0) === 0xE0) ((b = src()) === null || (c = src()) === null) && fail([a, b, c]), dst(((a & 0x0F) << 12) | ((b & 0x3F) << 6) | (c & 0x3F));
            else if ((a & 0xF8) === 0xF0) ((b = src()) === null || (c = src()) === null || (d = src()) === null) && fail([a, b, c, d]), dst(((a & 0x07) << 18) | ((b & 0x3F) << 12) | ((c & 0x3F) << 6) | (d & 0x3F));
            else throw RangeError(`Illegal starting byte: ${a}`);
        }
    }
    UTF16toUTF8(src, dst) {
        let c1, c2 = null;
        while (true) {
            if ((c1 = c2 !== null ? c2 : src()) === null) break;
            if (c1 >= 0xD800 && c1 <= 0xDFFF && (c2 = src()) !== null && c2 >= 0xDC00 && c2 <= 0xDFFF) {
                dst((c1 - 0xD800) * 0x400 + c2 - 0xDC00 + 0x10000);
                c2 = null;
                continue;
            }
            dst(c1);
        }
        if (c2 !== null) dst(c2);
    }
    UTF8toUTF16 = function (src, dst) {
        let cp = null;
        if (typeof src === "number") cp = src, src = function() { 
            return null; 
        }
        while (cp !== null || (cp = src()) !== null) {
            if (cp <= 0xFFFF) dst(cp);
            else cp -= 0x10000, dst((cp >> 10) + 0xD800), dst((cp % 0x400) + 0xDC00);
            cp = null;
        }
    }
    encodeUTF16toUTF8(src, dst) {
        utfx.UTF16toUTF8(src, (cp) => utfx.encodeUTF8(cp, dst));
    }
    decodeUTF8toUTF16(src, dst) {
        utfx.decodeUTF8(src, (cp) => utfx.UTF8toUTF16(cp, dst));
    }
    calculateCodePoint(cp) {
        return (cp < 0x80) ? 1 : (cp < 0x800) ? 2 : (cp < 0x10000) ? 3 : 4;
    }
    calculateUTF8(src) {
        let cp, l = 0;
        while ((cp = src()) !== null) l += (cp < 0x80) ? 1 : (cp < 0x800) ? 2 : (cp < 0x10000) ? 3 : 4;
        return l;
    }
    calculateUTF16asUTF8(src) {
        let n = 0, l = 0;
        utfx.UTF16toUTF8(src, (cp) => {
            ++n;
            l += (cp < 0x80) ? 1 : (cp < 0x800) ? 2 : (cp < 0x10000) ? 3 : 4;
        });
        return [n, l];
    }
}

const utfx = new Utfx();

class ByteBuffer {
    constructor(capacity, littleEndian, noAssert) {
        if (typeof capacity === 'undefined')
            capacity = ByteBuffer.DEFAULT_CAPACITY;
        if (typeof littleEndian === 'undefined')
            littleEndian = ByteBuffer.DEFAULT_ENDIAN;
        if (typeof noAssert === 'undefined')
            noAssert = ByteBuffer.DEFAULT_NOASSERT;
        if (!noAssert) {
            capacity = capacity | 0;
            if (capacity < 0)
                throw RangeError("Illegal capacity");
            littleEndian = !!littleEndian;
            noAssert = !!noAssert;
        }
        var EMPTY_BUFFER = new ArrayBuffer(0);
        this.buffer = capacity === 0 ? EMPTY_BUFFER : new ArrayBuffer(capacity);
        this.view = capacity === 0 ? null : new Uint8Array(this.buffer);
        this.offset = 0;
        this.markedOffset = -1;
        this.limit = capacity;
        this.littleEndian = littleEndian;
        this.noAssert = noAssert;
    };
    stringSource(s) {
        var i=0; return function() {
            return i < s.length ? s.charCodeAt(i++) : null;
        };
    }
    stringDestination() {
        var cs = [], ps = [];
        return function() {
            if (arguments.length === 0)
                return ps.join('')+String.fromCharCode.apply(String, cs);
            if (cs.length + arguments.length > 1024)
                ps.push(String.fromCharCode.apply(String, cs)),
                    cs.length = 0;
            Array.prototype.push.apply(cs, arguments);
        };
    }
    readInt8(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+1+") <= "+this.buffer.byteLength);
        }
        var value = this.view[offset];
        if ((value & 0x80) === 0x80) value = -(0xFF - value + 1); // Cast to signed
        if (relative) this.offset += 1;
        return value;
    };
    writeUint8(value, offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: "+value+" (not an integer)");
            value >>>= 0;
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        offset += 1;
        var capacity1 = this.buffer.byteLength;
        if (offset > capacity1)
            this.resize((capacity1 *= 2) > offset ? capacity1 : offset);
        offset -= 1;
        this.view[offset] = value;
        if (relative) this.offset += 1;
        return this;
    };
    readUint8(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+1+") <= "+this.buffer.byteLength);
        }
        var value = this.view[offset];
        if (relative) this.offset += 1;
        return value;
    };
    writeInt16(value, offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: "+value+" (not an integer)");
            value |= 0;
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        offset += 2;
        var capacity2 = this.buffer.byteLength;
        if (offset > capacity2)
            this.resize((capacity2 *= 2) > offset ? capacity2 : offset);
        offset -= 2;
        if (this.littleEndian) {
            this.view[offset+1] = (value & 0xFF00) >>> 8;
            this.view[offset  ] =  value & 0x00FF;
        } else {
            this.view[offset]   = (value & 0xFF00) >>> 8;
            this.view[offset+1] =  value & 0x00FF;
        }
        if (relative) this.offset += 2;
        return this;
    };
    readInt16(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 2 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+2+") <= "+this.buffer.byteLength);
        }
        var value = 0;
        if (this.littleEndian) {
            value  = this.view[offset  ];
            value |= this.view[offset+1] << 8;
        } else {
            value  = this.view[offset  ] << 8;
            value |= this.view[offset+1];
        }
        if ((value & 0x8000) === 0x8000) value = -(0xFFFF - value + 1); // Cast to signed
        if (relative) this.offset += 2;
        return value;
    };
    writeUint16(value, offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: "+value+" (not an integer)");
            value >>>= 0;
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        offset += 2;
        var capacity3 = this.buffer.byteLength;
        if (offset > capacity3)
            this.resize((capacity3 *= 2) > offset ? capacity3 : offset);
        offset -= 2;
        if (this.littleEndian) {
            this.view[offset+1] = (value & 0xFF00) >>> 8;
            this.view[offset  ] =  value & 0x00FF;
        } else {
            this.view[offset]   = (value & 0xFF00) >>> 8;
            this.view[offset+1] =  value & 0x00FF;
        }
        if (relative) this.offset += 2;
        return this;
    };
    readUint16(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 2 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+2+") <= "+this.buffer.byteLength);
        }
        var value = 0;
        if (this.littleEndian) {
            value  = this.view[offset  ];
            value |= this.view[offset+1] << 8;
        } else {
            value  = this.view[offset  ] << 8;
            value |= this.view[offset+1];
        }
        if (relative) this.offset += 2;
        return value;
    };
    writeInt32(value, offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: "+value+" (not an integer)");
            value |= 0;
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        offset += 4;
        var capacity4 = this.buffer.byteLength;
        if (offset > capacity4)
            this.resize((capacity4 *= 2) > offset ? capacity4 : offset);
        offset -= 4;
        if (this.littleEndian) {
            this.view[offset+3] = (value >>> 24) & 0xFF;
            this.view[offset+2] = (value >>> 16) & 0xFF;
            this.view[offset+1] = (value >>>  8) & 0xFF;
            this.view[offset  ] =  value         & 0xFF;
        } else {
            this.view[offset  ] = (value >>> 24) & 0xFF;
            this.view[offset+1] = (value >>> 16) & 0xFF;
            this.view[offset+2] = (value >>>  8) & 0xFF;
            this.view[offset+3] =  value         & 0xFF;
        }
        if (relative) this.offset += 4;
        return this;
    };
    readInt32(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 4 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+4+") <= "+this.buffer.byteLength);
        }
        var value = 0;
        if (this.littleEndian) {
            value  = this.view[offset+2] << 16;
            value |= this.view[offset+1] <<  8;
            value |= this.view[offset  ];
            value += this.view[offset+3] << 24 >>> 0;
        } else {
            value  = this.view[offset+1] << 16;
            value |= this.view[offset+2] <<  8;
            value |= this.view[offset+3];
            value += this.view[offset  ] << 24 >>> 0;
        }
        value |= 0;
        if (relative) this.offset += 4;
        return value;
    };
    writeUint32(value, offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: "+value+" (not an integer)");
            value >>>= 0;
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        offset += 4;
        var capacity5 = this.buffer.byteLength;
        if (offset > capacity5)
            this.resize((capacity5 *= 2) > offset ? capacity5 : offset);
        offset -= 4;
        if (this.littleEndian) {
            this.view[offset+3] = (value >>> 24) & 0xFF;
            this.view[offset+2] = (value >>> 16) & 0xFF;
            this.view[offset+1] = (value >>>  8) & 0xFF;
            this.view[offset  ] =  value         & 0xFF;
        } else {
            this.view[offset  ] = (value >>> 24) & 0xFF;
            this.view[offset+1] = (value >>> 16) & 0xFF;
            this.view[offset+2] = (value >>>  8) & 0xFF;
            this.view[offset+3] =  value         & 0xFF;
        }
        if (relative) this.offset += 4;
        return this;
    };
    readUint32(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 4 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+4+") <= "+this.buffer.byteLength);
        }
        var value = 0;
        if (this.littleEndian) {
            value  = this.view[offset+2] << 16;
            value |= this.view[offset+1] <<  8;
            value |= this.view[offset  ];
            value += this.view[offset+3] << 24 >>> 0;
        } else {
            value  = this.view[offset+1] << 16;
            value |= this.view[offset+2] <<  8;
            value |= this.view[offset+3];
            value += this.view[offset  ] << 24 >>> 0;
        }
        if (relative) this.offset += 4;
        return value;
    };
    calculateVarint32(value) {
        value = value >>> 0;
        if (value < 1 << 7 ) return 1;
        else if (value < 1 << 14) return 2;
        else if (value < 1 << 21) return 3;
        else if (value < 1 << 28) return 4;
        else                      return 5;
    };
    writeVarint32(value, offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: "+value+" (not an integer)");
            value |= 0;
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        var size = this.calculateVarint32(value),
            b;
        offset += size;
        var capacity10 = this.buffer.byteLength;
        if (offset > capacity10)
            this.resize((capacity10 *= 2) > offset ? capacity10 : offset);
        offset -= size;
        value >>>= 0;
        while (value >= 0x80) {
            b = (value & 0x7f) | 0x80;
            this.view[offset++] = b;
            value >>>= 7;
        }
        this.view[offset++] = value;
        if (relative) {
            this.offset = offset;
            return this;
        }
        return size;
    };
    readVarint32(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+1+") <= "+this.buffer.byteLength);
        }
        var c = 0,
            value = 0 >>> 0,
            b;
        do {
            if (!this.noAssert && offset > this.limit) {
                var err = Error("Truncated");
                err['truncated'] = true;
                throw err;
            }
            b = this.view[offset++];
            if (c < 5)
                value |= (b & 0x7f) << (7*c);
            ++c;
        } while ((b & 0x80) !== 0);
        value |= 0;
        if (relative) {
            this.offset = offset;
            return value;
        }
        return {
            "value": value,
            "length": c
        };
    };
    readUTF8String(length, metrics, offset) {
        if (typeof metrics === 'number') {
            offset = metrics;
            metrics = undefined;
        }
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (typeof metrics === 'undefined') metrics = "c";
        if (!this.noAssert) {
            if (typeof length !== 'number' || length % 1 !== 0)
                throw TypeError("Illegal length: "+length+" (not an integer)");
            length |= 0;
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        var i = 0,
            start = offset,
            sd;
        if (metrics === "c") {
            sd = this.stringDestination();
            utfx.decodeUTF8(function() {
                return i < length && offset < this.limit ? this.view[offset++] : null;
            }.bind(this), function(cp) {
                ++i; utfx.UTF8toUTF16(cp, sd);
            });
            if (i !== length)
                throw RangeError("Illegal range: Truncated data, "+i+" == "+length);
            if (relative) {
                this.offset = offset;
                return sd();
            } else {
                return {
                    "string": sd(),
                    "length": offset - start
                };
            }
        } else if (metrics === "b") {
            if (!this.noAssert) {
                if (typeof offset !== 'number' || offset % 1 !== 0)
                    throw TypeError("Illegal offset: "+offset+" (not an integer)");
                offset >>>= 0;
                if (offset < 0 || offset + length > this.buffer.byteLength)
                    throw RangeError("Illegal offset: 0 <= "+offset+" (+"+length+") <= "+this.buffer.byteLength);
            }
            var k = offset + length;
            utfx.decodeUTF8toUTF16(function() {
                return offset < k ? this.view[offset++] : null;
            }.bind(this), sd = this.stringDestination(), this.noAssert);
            if (offset !== k)
                throw RangeError("Illegal range: Truncated data, "+offset+" == "+k);
            if (relative) {
                this.offset = offset;
                return sd();
            } else {
                return {
                    'string': sd(),
                    'length': offset - start
                };
            }
        } else
            throw TypeError("Unsupported metrics: "+metrics);
    };
    writeVString(str, offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof str !== 'string')
                throw TypeError("Illegal str: Not a string");
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        var start = offset,
            k, l;
        k = utfx.calculateUTF16asUTF8(this.stringSource(str), this.noAssert)[1];
        l = this.calculateVarint32(k);
        offset += l+k;
        var capacity15 = this.buffer.byteLength;
        if (offset > capacity15)
            this.resize((capacity15 *= 2) > offset ? capacity15 : offset);
        offset -= l+k;
        offset += this.writeVarint32(k, offset);
        utfx.encodeUTF16toUTF8(this.stringSource(str), function(b) {
            this.view[offset++] = b;
        }.bind(this));
        if (offset !== start+k+l)
            throw RangeError("Illegal range: Truncated data, "+offset+" == "+(offset+k+l));
        if (relative) {
            this.offset = offset;
            return this;
        }
        return offset - start;
    };
    readVString(offset) {
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 1 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+1+") <= "+this.buffer.byteLength);
        }
        var start = offset;
        var len = this.readVarint32(offset);
        var str = this.readUTF8String(len['value'], "b", offset += len['length']);
        offset += str['length'];
        if (relative) {
            this.offset = offset;
            return str['string'];
        } else {
            return {
                'string': str['string'],
                'length': offset - start
            };
        }
    };
    append(source, encoding, offset) {
        if (typeof encoding === 'number' || typeof encoding !== 'string') {
            offset = encoding;
            encoding = undefined;
        }
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        if (!(source instanceof ByteBuffer))
            source = ByteBuffer.wrap(source, encoding);
        var length = source.limit - source.offset;
        if (length <= 0) return this;
        offset += length;
        var capacity16 = this.buffer.byteLength;
        if (offset > capacity16)
            this.resize((capacity16 *= 2) > offset ? capacity16 : offset);
        offset -= length;
        this.view.set(source.view.subarray(source.offset, source.limit), offset);
        source.offset += length;
        if (relative) this.offset += length;
        return this;
    };
    appendTo(target, offset) {
        target.append(this, offset);
        return this;
    };
    assert(assert) {
        this.noAssert = !assert;
        return this;
    };
    capacity() {
        return this.buffer.byteLength;
    };
    clear() {
        this.offset = 0;
        this.limit = this.buffer.byteLength;
        this.markedOffset = -1;
        return this;
    };
    clone(copy) {
        var bb = new ByteBuffer(0, this.littleEndian, this.noAssert);
        if (copy) {
            bb.buffer = new ArrayBuffer(this.buffer.byteLength);
            bb.view = new Uint8Array(bb.buffer);
        } else {
            bb.buffer = this.buffer;
            bb.view = this.view;
        }
        bb.offset = this.offset;
        bb.markedOffset = this.markedOffset;
        bb.limit = this.limit;
        return bb;
    };
    compact(begin, end) {
        if (typeof begin === 'undefined') begin = this.offset;
        if (typeof end === 'undefined') end = this.limit;
        if (!this.noAssert) {
            if (typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if (typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if (begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+begin+" <= "+end+" <= "+this.buffer.byteLength);
        }
        if (begin === 0 && end === this.buffer.byteLength)
            return this;
        var len = end - begin;
        if (len === 0) {
            this.buffer = EMPTY_BUFFER;
            this.view = null;
            if (this.markedOffset >= 0) this.markedOffset -= begin;
            this.offset = 0;
            this.limit = 0;
            return this;
        }
        var buffer = new ArrayBuffer(len);
        var view = new Uint8Array(buffer);
        view.set(this.view.subarray(begin, end));
        this.buffer = buffer;
        this.view = view;
        if (this.markedOffset >= 0) this.markedOffset -= begin;
        this.offset = 0;
        this.limit = len;
        return this;
    };
    copy(begin, end) {
        if (typeof begin === 'undefined') begin = this.offset;
        if (typeof end === 'undefined') end = this.limit;
        if (!this.noAssert) {
            if (typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if (typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if (begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+begin+" <= "+end+" <= "+this.buffer.byteLength);
        }
        if (begin === end)
            return new ByteBuffer(0, this.littleEndian, this.noAssert);
        var capacity = end - begin,
            bb = new ByteBuffer(capacity, this.littleEndian, this.noAssert);
        bb.offset = 0;
        bb.limit = capacity;
        if (bb.markedOffset >= 0) bb.markedOffset -= begin;
        this.copyTo(bb, 0, begin, end);
        return bb;
    };
    copyTo(target, targetOffset, sourceOffset, sourceLimit) {
        var relative,
            targetRelative;
        if (!this.noAssert) {
            if (!ByteBuffer.isByteBuffer(target))
                throw TypeError("Illegal target: Not a ByteBuffer");
        }
        targetOffset = (targetRelative = typeof targetOffset === 'undefined') ? target.offset : targetOffset | 0;
        sourceOffset = (relative = typeof sourceOffset === 'undefined') ? this.offset : sourceOffset | 0;
        sourceLimit = typeof sourceLimit === 'undefined' ? this.limit : sourceLimit | 0;

        if (targetOffset < 0 || targetOffset > target.buffer.byteLength)
            throw RangeError("Illegal target range: 0 <= "+targetOffset+" <= "+target.buffer.byteLength);
        if (sourceOffset < 0 || sourceLimit > this.buffer.byteLength)
            throw RangeError("Illegal source range: 0 <= "+sourceOffset+" <= "+this.buffer.byteLength);

        var len = sourceLimit - sourceOffset;
        if (len === 0)
            return target;

        target.ensureCapacity(targetOffset + len);

        target.view.set(this.view.subarray(sourceOffset, sourceLimit), targetOffset);

        if (relative) this.offset += len;
        if (targetRelative) target.offset += len;

        return this;
    };
    ensureCapacity(capacity) {
        var current = this.buffer.byteLength;
        if (current < capacity)
            return this.resize((current *= 2) > capacity ? current : capacity);
        return this;
    };
    fill(value, begin, end) {
        var relative = typeof begin === 'undefined';
        if (relative) begin = this.offset;
        if (typeof value === 'string' && value.length > 0)
            value = value.charCodeAt(0);
        if (typeof begin === 'undefined') begin = this.offset;
        if (typeof end === 'undefined') end = this.limit;
        if (!this.noAssert) {
            if (typeof value !== 'number' || value % 1 !== 0)
                throw TypeError("Illegal value: "+value+" (not an integer)");
            value |= 0;
            if (typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if (typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if (begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+begin+" <= "+end+" <= "+this.buffer.byteLength);
        }
        if (begin >= end)
            return this;
        while (begin < end) this.view[begin++] = value;
        if (relative) this.offset = begin;
        return this;
    };
    flip() {
        this.limit = this.offset;
        this.offset = 0;
        return this;
    };
    mark(offset) {
        offset = typeof offset === 'undefined' ? this.offset : offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        this.markedOffset = offset;
        return this;
    };
    order(littleEndian) {
        if (!this.noAssert) {
            if (typeof littleEndian !== 'boolean')
                throw TypeError("Illegal littleEndian: Not a boolean");
        }
        this.littleEndian = !!littleEndian;
        return this;
    };
    LE(littleEndian) {
        this.littleEndian = typeof littleEndian !== 'undefined' ? !!littleEndian : true;
        return this;
    };
    BE(bigEndian) {
        this.littleEndian = typeof bigEndian !== 'undefined' ? !bigEndian : false;
        return this;
    };
    prepend(source, encoding, offset) {
        if (typeof encoding === 'number' || typeof encoding !== 'string') {
            offset = encoding;
            encoding = undefined;
        }
        var relative = typeof offset === 'undefined';
        if (relative) offset = this.offset;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: "+offset+" (not an integer)");
            offset >>>= 0;
            if (offset < 0 || offset + 0 > this.buffer.byteLength)
                throw RangeError("Illegal offset: 0 <= "+offset+" (+"+0+") <= "+this.buffer.byteLength);
        }
        if (!(source instanceof ByteBuffer))
            source = ByteBuffer.wrap(source, encoding);
        var len = source.limit - source.offset;
        if (len <= 0) return this;
        var diff = len - offset;
        if (diff > 0) {
            var buffer = new ArrayBuffer(this.buffer.byteLength + diff);
            var view = new Uint8Array(buffer);
            view.set(this.view.subarray(offset, this.buffer.byteLength), len);
            this.buffer = buffer;
            this.view = view;
            this.offset += diff;
            if (this.markedOffset >= 0) this.markedOffset += diff;
            this.limit += diff;
            offset += diff;
        } else {
            var arrayView = new Uint8Array(this.buffer);
        }
        this.view.set(source.view.subarray(source.offset, source.limit), offset - len);

        source.offset = source.limit;
        if (relative)
            this.offset -= len;
        return this;
    };
    prependTo(target, offset) {
        target.prepend(this, offset);
        return this;
    };
    printDebug(out) {
        if (typeof out !== 'function') out = console.log.bind(console);
        out(
            this.toString()+"\n"+
            "-------------------------------------------------------------------\n"+
            this.toDebug(true)
        );
    };
    remaining() {
        return this.limit - this.offset;
    };
    reset() {
        if (this.markedOffset >= 0) {
            this.offset = this.markedOffset;
            this.markedOffset = -1;
        } else {
            this.offset = 0;
        }
        return this;
    };
    resize(capacity) {
        if (!this.noAssert) {
            if (typeof capacity !== 'number' || capacity % 1 !== 0)
                throw TypeError("Illegal capacity: "+capacity+" (not an integer)");
            capacity |= 0;
            if (capacity < 0)
                throw RangeError("Illegal capacity: 0 <= "+capacity);
        }
        if (this.buffer.byteLength < capacity) {
            var buffer = new ArrayBuffer(capacity);
            var view = new Uint8Array(buffer);
            view.set(this.view);
            this.buffer = buffer;
            this.view = view;
        }
        return this;
    };
    reverse(begin, end) {
        if (typeof begin === 'undefined') begin = this.offset;
        if (typeof end === 'undefined') end = this.limit;
        if (!this.noAssert) {
            if (typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if (typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if (begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+begin+" <= "+end+" <= "+this.buffer.byteLength);
        }
        if (begin === end)
            return this;
        Array.prototype.reverse.call(this.view.subarray(begin, end));
        return this;
    };
    skip(length) {
        if (!this.noAssert) {
            if (typeof length !== 'number' || length % 1 !== 0)
                throw TypeError("Illegal length: "+length+" (not an integer)");
            length |= 0;
        }
        var offset = this.offset + length;
        if (!this.noAssert) {
            if (offset < 0 || offset > this.buffer.byteLength)
                throw RangeError("Illegal length: 0 <= "+this.offset+" + "+length+" <= "+this.buffer.byteLength);
        }
        this.offset = offset;
        return this;
    };
    slice(begin, end) {
        if (typeof begin === 'undefined') begin = this.offset;
        if (typeof end === 'undefined') end = this.limit;
        if (!this.noAssert) {
            if (typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if (typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if (begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+begin+" <= "+end+" <= "+this.buffer.byteLength);
        }
        var bb = this.clone();
        bb.offset = begin;
        bb.limit = end;
        return bb;
    };
    toArrayBuffer(forceCopy) {
        var offset = this.offset,
            limit = this.limit;
        if (!this.noAssert) {
            if (typeof offset !== 'number' || offset % 1 !== 0)
                throw TypeError("Illegal offset: Not an integer");
            offset >>>= 0;
            if (typeof limit !== 'number' || limit % 1 !== 0)
                throw TypeError("Illegal limit: Not an integer");
            limit >>>= 0;
            if (offset < 0 || offset > limit || limit > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+offset+" <= "+limit+" <= "+this.buffer.byteLength);
        }
        if (!forceCopy && offset === 0 && limit === this.buffer.byteLength)
            return this.buffer;
        if (offset === limit)
            return EMPTY_BUFFER;
        var buffer = new ArrayBuffer(limit - offset);
        new Uint8Array(buffer).set(new Uint8Array(this.buffer).subarray(offset, limit), 0);
        return buffer;
    };
    toString(encoding, begin, end) {
        if (typeof encoding === 'undefined')
            return "ByteBufferAB(offset="+this.offset+",markedOffset="+this.markedOffset+",limit="+this.limit+",capacity="+this.capacity()+")";
        if (typeof encoding === 'number')
            encoding = "utf8",
                begin = encoding,
                end = begin;
        switch (encoding) {
            case "utf8":
                return this.toUTF8(begin, end);
            case "base64":
                return this.toBase64(begin, end);
            case "hex":
                return this.toHex(begin, end);
            case "binary":
                return this.toBinary(begin, end);
            case "debug":
                return this.toDebug();
            case "columns":
                return this.toColumns();
            default:
                throw Error("Unsupported encoding: "+encoding);
        }
    };
    toBase64(begin, end) {
        if (typeof begin === 'undefined')
            begin = this.offset;
        if (typeof end === 'undefined')
            end = this.limit;
        begin = begin | 0; end = end | 0;
        if (begin < 0 || end > this.capacity || begin > end)
            throw RangeError("begin, end");
        var sd; lxiv.encode(function() {
            return begin < end ? this.view[begin++] : null;
        }.bind(this), sd = this.stringDestination());
        return sd();
    };
    fromBase64(str, littleEndian) {
        if (typeof str !== 'string')
            throw TypeError("str");
        var bb = new ByteBuffer(str.length/4*3, littleEndian),
            i = 0;
        lxiv.decode(this.stringSource(str), function(b) {
            bb.view[i++] = b;
        });
        bb.limit = i;
        return bb;
    };
    btoa(str) {
        return this.fromBinary(str).toBase64();
    };
    atob(b64) {
        return this.fromBase64(b64).toBinary();
    };
    toBinary(begin, end) {
        if (typeof begin === 'undefined')
            begin = this.offset;
        if (typeof end === 'undefined')
            end = this.limit;
        begin |= 0; end |= 0;
        if (begin < 0 || end > this.capacity() || begin > end)
            throw RangeError("begin, end");
        if (begin === end)
            return "";
        var chars = [],
            parts = [];
        while (begin < end) {
            chars.push(this.view[begin++]);
            if (chars.length >= 1024)
                parts.push(String.fromCharCode.apply(String, chars)),
                    chars = [];
        }
        return parts.join('') + String.fromCharCode.apply(String, chars);
    };
    fromBinary(str, littleEndian) {
        if (typeof str !== 'string')
            throw TypeError("str");
        var i = 0,
            k = str.length,
            charCode,
            bb = new ByteBuffer(k, littleEndian);
        while (i<k) {
            charCode = str.charCodeAt(i);
            if (charCode > 0xff)
                throw RangeError("illegal char code: "+charCode);
            bb.view[i++] = charCode;
        }
        bb.limit = k;
        return bb;
    };
    toDebug(columns) {
        var i = -1,
            k = this.buffer.byteLength,
            b,
            hex = "",
            asc = "",
            out = "";
        while (i<k) {
            if (i !== -1) {
                b = this.view[i];
                if (b < 0x10) hex += "0"+b.toString(16).toUpperCase();
                else hex += b.toString(16).toUpperCase();
                if (columns)
                    asc += b > 32 && b < 127 ? String.fromCharCode(b) : '.';
            }
            ++i;
            if (columns) {
                if (i > 0 && i % 16 === 0 && i !== k) {
                    while (hex.length < 3*16+3) hex += " ";
                    out += hex+asc+"\n";
                    hex = asc = "";
                }
            }
            if (i === this.offset && i === this.limit)
                hex += i === this.markedOffset ? "!" : "|";
            else if (i === this.offset)
                hex += i === this.markedOffset ? "[" : "<";
            else if (i === this.limit)
                hex += i === this.markedOffset ? "]" : ">";
            else
                hex += i === this.markedOffset ? "'" : (columns || (i !== 0 && i !== k) ? " " : "");
        }
        if (columns && hex !== " ") {
            while (hex.length < 3*16+3)
                hex += " ";
            out += hex + asc + "\n";
        }
        return columns ? out : hex;
    };
    fromDebug(str, littleEndian, noAssert) {
        var k = str.length,
            bb = new ByteBuffer(((k+1)/3)|0, littleEndian, noAssert);
        var i = 0, j = 0, ch, b,
            rs = false,
            ho = false, hm = false, hl = false,
            fail = false;
        while (i<k) {
            switch (ch = str.charAt(i++)) {
                case '!':
                    if (!noAssert) {
                        if (ho || hm || hl) {
                            fail = true;
                            break;
                        }
                        ho = hm = hl = true;
                    }
                    bb.offset = bb.markedOffset = bb.limit = j;
                    rs = false;
                    break;
                case '|':
                    if (!noAssert) {
                        if (ho || hl) {
                            fail = true;
                            break;
                        }
                        ho = hl = true;
                    }
                    bb.offset = bb.limit = j;
                    rs = false;
                    break;
                case '[':
                    if (!noAssert) {
                        if (ho || hm) {
                            fail = true;
                            break;
                        }
                        ho = hm = true;
                    }
                    bb.offset = bb.markedOffset = j;
                    rs = false;
                    break;
                case '<':
                    if (!noAssert) {
                        if (ho) {
                            fail = true;
                            break;
                        }
                        ho = true;
                    }
                    bb.offset = j;
                    rs = false;
                    break;
                case ']':
                    if (!noAssert) {
                        if (hl || hm) {
                            fail = true;
                            break;
                        }
                        hl = hm = true;
                    }
                    bb.limit = bb.markedOffset = j;
                    rs = false;
                    break;
                case '>':
                    if (!noAssert) {
                        if (hl) {
                            fail = true;
                            break;
                        }
                        hl = true;
                    }
                    bb.limit = j;
                    rs = false;
                    break;
                case "'":
                    if (!noAssert) {
                        if (hm) {
                            fail = true;
                            break;
                        }
                        hm = true;
                    }
                    bb.markedOffset = j;
                    rs = false;
                    break;
                case ' ':
                    rs = false;
                    break;
                default:
                    if (!noAssert) {
                        if (rs) {
                            fail = true;
                            break;
                        }
                    }
                    b = parseInt(ch+str.charAt(i++), 16);
                    if (!noAssert) {
                        if (isNaN(b) || b < 0 || b > 255)
                            throw TypeError("Illegal str: Not a debug encoded string");
                    }
                    bb.view[j++] = b;
                    rs = true;
            }
            if (fail)
                throw TypeError("Illegal str: Invalid symbol at "+i);
        }
        if (!noAssert) {
            if (!ho || !hl)
                throw TypeError("Illegal str: Missing offset or limit");
            if (j<bb.buffer.byteLength)
                throw TypeError("Illegal str: Not a debug encoded string (is it hex?) "+j+" < "+k);
        }
        return bb;
    };
    toHex(begin, end) {
        begin = typeof begin === 'undefined' ? this.offset : begin;
        end = typeof end === 'undefined' ? this.limit : end;
        if (!this.noAssert) {
            if (typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if (typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if (begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+begin+" <= "+end+" <= "+this.buffer.byteLength);
        }
        var out = new Array(end - begin),
            b;
        while (begin < end) {
            b = this.view[begin++];
            if (b < 0x10)
                out.push("0", b.toString(16));
            else out.push(b.toString(16));
        }
        return out.join('');
    };
    fromHex(str, littleEndian, noAssert) {
        if (!noAssert) {
            if (typeof str !== 'string')
                throw TypeError("Illegal str: Not a string");
            if (str.length % 2 !== 0)
                throw TypeError("Illegal str: Length not a multiple of 2");
        }
        var k = str.length,
            bb = new ByteBuffer((k / 2) | 0, littleEndian),
            b;
        for (var i=0, j=0; i<k; i+=2) {
            b = parseInt(str.substring(i, i+2), 16);
            if (!noAssert)
                if (!isFinite(b) || b < 0 || b > 255)
                    throw TypeError("Illegal str: Contains non-hex characters");
            bb.view[j++] = b;
        }
        bb.limit = j;
        return bb;
    };
    toUTF8(begin, end) {
        if (typeof begin === 'undefined') begin = this.offset;
        if (typeof end === 'undefined') end = this.limit;
        if (!this.noAssert) {
            if (typeof begin !== 'number' || begin % 1 !== 0)
                throw TypeError("Illegal begin: Not an integer");
            begin >>>= 0;
            if (typeof end !== 'number' || end % 1 !== 0)
                throw TypeError("Illegal end: Not an integer");
            end >>>= 0;
            if (begin < 0 || begin > end || end > this.buffer.byteLength)
                throw RangeError("Illegal range: 0 <= "+begin+" <= "+end+" <= "+this.buffer.byteLength);
        }
        var sd; try {
            utfx.decodeUTF8toUTF16(function() {
                return begin < end ? this.view[begin++] : null;
            }.bind(this), sd = this.stringDestination());
        } catch (e) {
            if (begin !== end)
                throw RangeError("Illegal range: Truncated data, "+begin+" != "+end);
        }
        return sd();
    };
    fromUTF8(str, littleEndian, noAssert) {
        if (!noAssert)
            if (typeof str !== 'string')
                throw TypeError("Illegal str: Not a string");
        var bb = new ByteBuffer(utfx.calculateUTF16asUTF8(this.stringSource(str), true)[1], littleEndian, noAssert),
            i = 0;
        utfx.encodeUTF16toUTF8(this.stringSource(str), function(b) {
            bb.view[i++] = b;
        });
        bb.limit = i;
        return bb;
    };
}
ByteBuffer.VERSION = "5.0.1";
ByteBuffer.LITTLE_ENDIAN = true;
ByteBuffer.BIG_ENDIAN = false;
ByteBuffer.DEFAULT_CAPACITY = 16;
ByteBuffer.DEFAULT_ENDIAN = ByteBuffer.BIG_ENDIAN;
ByteBuffer.DEFAULT_NOASSERT = false;
ByteBuffer.Long = null;
ByteBuffer.accessor = function() {
    return Uint8Array;
};
ByteBuffer.allocate = function(capacity, littleEndian, noAssert) {
    return new ByteBuffer(capacity, littleEndian, noAssert);
};
ByteBuffer.concat = function(buffers, encoding, littleEndian, noAssert) {
    if (typeof encoding === 'boolean' || typeof encoding !== 'string') {
        noAssert = littleEndian;
        littleEndian = encoding;
        encoding = undefined;
    }
    var capacity = 0;
    for (var i=0, k=buffers.length, length; i<k; ++i) {
        if (!ByteBuffer.isByteBuffer(buffers[i]))
            buffers[i] = ByteBuffer.wrap(buffers[i], encoding);
        length = buffers[i].limit - buffers[i].offset;
        if (length > 0) capacity += length;
    }
    if (capacity === 0)
        return new ByteBuffer(0, littleEndian, noAssert);
    var bb = new ByteBuffer(capacity, littleEndian, noAssert),
        bi;
    i=0; while (i<k) {
        bi = buffers[i++];
        length = bi.limit - bi.offset;
        if (length <= 0) continue;
        bb.view.set(bi.view.subarray(bi.offset, bi.limit), bb.offset);
        bb.offset += length;
    }
    bb.limit = bb.offset;
    bb.offset = 0;
    return bb;
};
ByteBuffer.isByteBuffer = function(bb) {
    return (bb && bb["__isByteBuffer__"]) === true;
};
ByteBuffer.type = function() {
    return ArrayBuffer;
};
ByteBuffer.wrap = function(buffer, encoding, littleEndian, noAssert) {
    if (typeof encoding !== 'string') {
        noAssert = littleEndian;
        littleEndian = encoding;
        encoding = undefined;
    }
    if (typeof buffer === 'string') {
        if (typeof encoding === 'undefined')
            encoding = "utf8";
        switch (encoding) {
            case "base64":
                return ByteBuffer.fromBase64(buffer, littleEndian);
            case "hex":
                return ByteBuffer.fromHex(buffer, littleEndian);
            case "binary":
                return ByteBuffer.fromBinary(buffer, littleEndian);
            case "utf8":
                return ByteBuffer.fromUTF8(buffer, littleEndian);
            case "debug":
                return ByteBuffer.fromDebug(buffer, littleEndian);
            default:
                throw Error("Unsupported encoding: "+encoding);
        }
    }
    if (buffer === null || typeof buffer !== 'object')
        throw TypeError("Illegal buffer");
    var bb;
    if (ByteBuffer.isByteBuffer(buffer)) {
        bb = ByteBufferPrototype.clone.call(buffer);
        bb.markedOffset = -1;
        return bb;
    }
    if (buffer instanceof Uint8Array) {
        bb = new ByteBuffer(0, littleEndian, noAssert);
        if (buffer.length > 0) {
            bb.buffer = buffer.buffer;
            bb.offset = buffer.byteOffset;
            bb.limit = buffer.byteOffset + buffer.byteLength;
            bb.view = new Uint8Array(buffer.buffer);
        }
    } else if (buffer instanceof ArrayBuffer) {
        bb = new ByteBuffer(0, littleEndian, noAssert);
        if (buffer.byteLength > 0) {
            bb.buffer = buffer;
            bb.offset = 0;
            bb.limit = buffer.byteLength;
            bb.view = buffer.byteLength > 0 ? new Uint8Array(buffer) : null;
        }
    } else if (Object.prototype.toString.call(buffer) === "[object Array]") {
        bb = new ByteBuffer(buffer.length, littleEndian, noAssert);
        bb.limit = buffer.length;
        for (var i=0; i<buffer.length; ++i)
            bb.view[i] = buffer[i];
    } else
        throw TypeError("Illegal buffer");
    return bb;
};

let wasmbuffers;

fetch("asset/smallWasm.wasm").then((e) => {
    return e.arrayBuffer();
}).then((wasmbytes) => {
    wasmbuffers = wasmbytes;
});

const wasmmodule = () => {
    let uid = 0;
    function setHeaps() {
        const buffer = exportG.buffer;
        exports.HEAPU8 = HEAPU8 = new Uint8Array(buffer);
    }
    function instantiate(methods, callback) {
        WebAssembly.instantiate(wasmbuffers, methods).then((e) => {
            callback(e);
        });
    }
    function initializeInstance() {
        function asmInstanceCallback(asm) {
            exports.asm = asm.exports;
            exportG = exports.asm.g;
            exports.asm.h();
            exports.asm.i();
            setHeaps();
            Module.ready = true;
            if (Module.opcode5Callback) {
                Module.onDecodeOpcode5(Module.blended, Module.hostname, Module.opcode5Callback);
            }
            return exports.asm;
        }
        instantiate({
            "a": methods
        }, (asm) => {
            asmInstanceCallback(asm.instance);
        });
    }
    let exportG;
    let HEAPU8;
    const exports = {};
    const decoder = new TextDecoder('utf8');
    const intCalc = function(heapu8, int) {
        for (var n = int; heapu8[n] && !(n >= NaN); ) ++n;
        if (n - int > 0x10 && heapu8.buffer && decoder) return decoder.decode(heapu8.subarray(int, n));
        for (var finalInt = ''; int < n; ) {
            var e = heapu8[int++];
            if (0x80 & e) {
                var j = 0x3f & heapu8[int++];
                if (0xc0 != (0xe0 & e)) {
                    var k = 0x3f & heapu8[int++];
                    if (e = 0xe0 == (0xf0 & e) ? (0xf & e) << 0xc | j << 0x6 | k : (0x7 & e) << 0x12 | j << 0xc | k << 0x6 | 0x3f & heapu8[int++], e < 0x10000)
                        finalInt += String.fromCharCode(e);
                    else {
                        var diff = e - 0x10000;
                        finalInt += String.fromCharCode(0xd800 | diff >> 0xa, 0xdc00 | 0x3ff & diff);
                    }
                } else finalInt += String.fromCharCode((0x1f & e) << 0x6 | j);
            } else finalInt += String.fromCharCode(e);
        }
        return finalInt;
    }
    const intToStr = function(int) {
        return intCalc(HEAPU8, int);
    }
    const repeater = function(int) {
        return 0 | cstr(intToStr(int));
    }
    const getBufferDifference = function(ipAddress, buffer, bufferSize, undf) {
        if (!(undf > 0)) {
            return 0;
        }
        var byteSize = bufferSize;
        var int = bufferSize + undf - 1;
        for (var i = 0; i < ipAddress.length; ++i) {
            var charCode = ipAddress.charCodeAt(i);
            if (charCode >= 0xd800 && charCode <= 0xdfff) {
                var _charCode = ipAddress.charCodeAt(++i);
                charCode = 0x10000 + ((0x3ff & charCode) << 0xa) | 0x3ff & _charCode;
            }
            if (charCode <= 0x7f) {
                if (bufferSize >= int) break;
                buffer[bufferSize++] = charCode;
            } else {
                if (charCode <= 0x7ff) {
                    if (bufferSize + 0x1 >= int) break;
                    buffer[bufferSize++] = 0xc0 | charCode >> 0x6,
                    buffer[bufferSize++] = 0x80 | 0x3f & charCode;
                } else {
                    if (charCode <= 0xffff) {
                        if (bufferSize + 0x2 >= int) break;
                        buffer[bufferSize++] = 0xe0 | charCode >> 0xc,
                        buffer[bufferSize++] = 0x80 | charCode >> 0x6 & 0x3f,
                        buffer[bufferSize++] = 0x80 | 0x3f & charCode;
                    } else {
                        if (bufferSize + 0x3 >= int) break;
                        buffer[bufferSize++] = 0xf0 | charCode >> 0x12,
                        buffer[bufferSize++] = 0x80 | charCode >> 0xc & 0x3f,
                        buffer[bufferSize++] = 0x80 | charCode >> 0x6 & 0x3f,
                        buffer[bufferSize++] = 0x80 | 0x3f & charCode;
                    }
                }
            }
        }
        buffer[bufferSize] = 0;
        return bufferSize - byteSize;
    }
    const cstr = (str) => {
        if (str.startsWith('typeof window === "undefined" ? 1 : 0')) return 0;
        if (str.startsWith("typeof process !== 'undefined' ? 1 : 0")) return 0;
        if (str.startsWith("Game.currentGame.network.connected ? 1 : 0")) return 1;
        if (str.startsWith("Game.currentGame.network.connectionOptions.ipAddress")) return Module.hostname;
        if (str.startsWith("Game.currentGame.world.myUid === null ? 0 : Game.currentGame.world.myUid")) return ((uid++) ? 0 : 1);
        if (str.startsWith('document.getElementById("hud").children.length')) return 24;
    }
    const importB = function aFunction(int) {
        var ipAddress = cstr(intToStr(int));
        if (null == ipAddress) {
            return 0;
        }
        ipAddress += '';
        var func = aFunction;
        func.bufferSize = ipAddress.length + 1;
        func.buffer = asmL(func.bufferSize);
        getBufferDifference(ipAddress, HEAPU8, func.buffer, func.bufferSize);
        return func.buffer;
    }
    const methods = {
        "d": () => {},
        "f": () => {},
        "c": repeater,
        "e": () => {},
        "b": importB,
        "a": () => {}
    }
    initializeInstance();
    let asmL = function() {
        return (asmL = exports.asm.l).apply(null, arguments);
    }
    const Module = exports;
    Module.decodeBlendInternal = (blended) => {
        Module.asm.j(24, 132);
        const pos = Module.asm.j(228, 132);
        const extra = new Uint8Array(blended);
        for (let i = 0; i < 132; i++) {
            Module.HEAPU8[pos + i] = extra[i + 1];
        }
        Module.asm.j(172, 36);
        const index = Module.asm.j(4, 152);
        const arraybuffer = new ArrayBuffer(64);
        const list = new Uint8Array(arraybuffer);
        for (let i = 0; i < 64; i++) {
            list[i] = Module.HEAPU8[index + i];
        }
        return arraybuffer;
    }
    Module.onDecodeOpcode5 = (blended, hostname, callback) => {
        Module.blended = blended;
        Module.hostname = hostname;
        if (!Module.ready) {
            return (Module.opcode5Callback = callback);
        }
        Module.asm.j(255, 140);
        const decoded = Module.decodeBlendInternal(blended);
        const mcs = Module.asm.j(187, 22);
        const opcode6Data = [6];
        for (let i = 0; i < 16; i++) {
            opcode6Data.push(Module.HEAPU8[mcs + i]);
        }
        callback({5: decoded, 6: new Uint8Array(opcode6Data)});
    }
    Module.finalizeOpcode10 = (blended) => {
        const decoded = Module.decodeBlendInternal(blended);
        const list = new Uint8Array(decoded);
        const data = [10];
        for (let i = 0; i < decoded.byteLength; i++) {
            data.push(list[i]);
        }
        return new Uint8Array(data);
    }
    return Module;
}

let Module;
let isMade = 0;

if (localStorage.t6BlueTextures === undefined) {
    localStorage.t6BlueTextures = "true";
}

const Game = ((modules) => {
        let installedModules = {};
        let __webpack_require__ = (moduleId) => {
            if(installedModules[moduleId]) return installedModules[moduleId].exports;
            let module = installedModules[moduleId] = {
                exports: {},
                id: moduleId,
                loaded: false
            };
            modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
            module.loaded = true;
            return module.exports;
        }
        __webpack_require__.m = modules;
        __webpack_require__.c = installedModules;
        __webpack_require__.p = "";
        return __webpack_require__(0);
    })
([
    /* 0 */
    ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        module.exports = Game_1.default;
    }),
    /* 1 */
    ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(2);
        let World_1 = __webpack_require__(320);
        let Renderer_1 = __webpack_require__(322);
        class Game extends Game_1.default {
            constructor(options) {
                super();
                this.options = options || {};
                this.worldType = World_1.default;
                this.rendererType = Renderer_1.default;
                setTimeout(() => this.enablePooling(), 500);
            }
            enablePooling() {
                this.setNetworkEntityPooling(200);
                this.setModelEntityPooling('ProjectileArrowModel', 50);
                this.setModelEntityPooling('ProjectileBombModel', 50);
                this.setModelEntityPooling('ProjectileCannonModel', 50);
                this.setModelEntityPooling('ProjectileMageModel', 50);
                this.preload();
            }
            run() {}
        }
        exports.default = Game;
    }),
    /* 2 */
    ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        var AssetManager_1 = __webpack_require__(3);
        var Renderer_1 = __webpack_require__(245);
        var InputManager_1 = __webpack_require__(251);
        var InputPacketScheduler_1 = __webpack_require__(252);
        var InputPacketCreator_1 = __webpack_require__(253);
        var World_1 = __webpack_require__(257);
        var BinNetworkAdapter_1 = __webpack_require__(259);
        var Debug_1 = __webpack_require__(267);
        var Metrics_1 = __webpack_require__(269);
        var Ui_1 = __webpack_require__(270);
        var events = __webpack_require__(250);
        class Game extends events.EventEmitter {
            constructor(options) {
                super();
                if (!options) { options = {}; }
                this.options = {};
                this.assetManagerType = AssetManager_1.default;
                this.networkType = BinNetworkAdapter_1.default;
                this.rendererType = Renderer_1.default;
                this.inputManagerType = InputManager_1.default;
                this.inputPacketSchedulerType = InputPacketScheduler_1.default;
                this.inputPacketCreatorType = InputPacketCreator_1.default;
                this.worldType = World_1.default;
                this.debugType = Debug_1.default;
                this.metricsType = Metrics_1.default;
                this.uiType = Ui_1.default;
                this.group = 0;
                this.networkEntityPooling = false;
                this.modelEntityPooling = {};
                events.EventEmitter.defaultMaxListeners = 50;
                this.setMaxListeners(events.EventEmitter.defaultMaxListeners);
                Game.currentGame = this;
                this.options = options;
            }
            init(callback) {
                this.assetManager = new this.assetManagerType();
                this.network = new this.networkType();
                this.renderer = new this.rendererType();
                this.inputManager = new this.inputManagerType();
                this.inputPacketScheduler = new this.inputPacketSchedulerType();
                this.inputPacketCreator = new this.inputPacketCreatorType();
                this.world = new this.worldType();
                this.debug = new this.debugType();
                this.metrics = new this.metricsType();
                this.ui = new this.uiType();
                this.inputPacketScheduler.start();
                this.inputPacketCreator.start();
                this.world.init();
                this.start(true);
                callback.bind(this)();
            };
            stop() {
                this.renderer.stop();
            };
            start(firstTime) {
                this.renderer.start(firstTime);
            };
            run() {
            }
            preload() {
                this.world.preloadNetworkEntities();
                this.world.preloadModelEntities();
            };
            getNetworkEntityPooling() {
                return this.networkEntityPooling;
            };
            setNetworkEntityPooling(poolSize) {
                this.networkEntityPooling = poolSize;
            };
            getModelEntityPooling(modelName) {
                if (modelName === void 0) { modelName = null; }
                if (modelName) {
                    return !!this.modelEntityPooling[modelName];
                }
                return this.modelEntityPooling;
            };
            setModelEntityPooling(modelName, poolSize) {
                this.modelEntityPooling[modelName] = poolSize;
            };
            setGroup(group) {
                this.group = group;
            };
            getGroup() {
                return this.group;
            };
        }
        exports.default = Game;
    }),
    /* 3 */
    ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let f095 = __webpack_require__(195);
        class AssetManager {
            constructor() {
                this.shouldPreload = true;
            }
            load(files, callback) {
                if (callback === void 0) { callback = false; }
                if (!this.shouldPreload) {
                    return;
                }
                PIXI.loader.add(files).load(function () {
                    if (callback) {
                        callback();
                    }
                });
            };
            addProgressCallback(callback) {
                PIXI.loader.on('progress', function (loader) {
                    callback(loader.progress);
                });
            };
            getShouldPreload() {
                return this.shouldPreload;
            };
            setShouldPreload(shouldPreload) {
                this.shouldPreload = shouldPreload;
            };
            loadModel(modelName, args) {
                if (args === void 0) { args = null; }
                var ModelClass = f095("./" + modelName);
                return new ModelClass['default'](args);
            };
        }
        exports.default = AssetManager;
    }),
    /* 4 */
    (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 5 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 6 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 7 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 8 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 9 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 10 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 11 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 12 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 13 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 14 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 15 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 16 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 17 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 18 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 19 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 20 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 21 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 22 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 23 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 24 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 25 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 26 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 27 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 28 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 29 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 30 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 31 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 32 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 33 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 34 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 35 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 36 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 37 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 38 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 39 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 40 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 41 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 42 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 43 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 44 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 45 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 46 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 47 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 48 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 49 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 50 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 51 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 52 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 53 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 54 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 55 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 56 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 57 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 58 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 59 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 60 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 61 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 62 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 63 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 64 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 65 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 66 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 67 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 68 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 69 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 70 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 71 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 72 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 73 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 74 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 75 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 76 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 77 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 78 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 79 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 80 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 81 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 82 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 83 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 84 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 85 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 86 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 87 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 88 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 89 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 90 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 91 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 92 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 93 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 94 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 95 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 96 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 97 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 98 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 99 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 100 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 101 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 102 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 103 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 104 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 105 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 106 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 107 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 108 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 109 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 110 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 111 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 112 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 113 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 114 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 115 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 116 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 117 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 118 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 119 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 120 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 121 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 122 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 123 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 124 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 125 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 126 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 127 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 128 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 129 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 130 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 131 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 132 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 133 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 134 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 135 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 136 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 137 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 138 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 139 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 140 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 141 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 142 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 143 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 144 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 145 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 146 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 147 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 148 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 149 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 150 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 151 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 152 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 153 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 154 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 155 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 156 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 157 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 158 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 159 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 160 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 161 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 162 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 163 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 164 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 165 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 166 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 167 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 168 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 169 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 170 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 171 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 172 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 173 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 174 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 175 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 176 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 177 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 178 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 179 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 180 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 181 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 182 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 183 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 184 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 185 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 186 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 187 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 188 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 189 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 190 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 191 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 192 */
    /***/ (function(module, exports, __webpack_require__) {

        (function(process) {

            exports = module.exports = __webpack_require__(193);
            exports.log = log;
            exports.formatArgs = formatArgs;
            exports.save = save;
            exports.load = load;
            exports.useColors = useColors;
            exports.storage = 'undefined' != typeof chrome
            && 'undefined' != typeof chrome.storage
                ? chrome.storage.local
            : localstorage();
            exports.colors = [
                'lightseagreen',
                'forestgreen',
                'goldenrod',
                'dodgerblue',
                'darkorchid',
                'crimson'
            ];

            function useColors() {
                if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
                    return true;
                }
                return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
                    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
                    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
                    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
            }

            exports.formatters.j = function(v) {
                try {
                    return JSON.stringify(v);
                } catch (err) {
                    return '[UnexpectedJSONParseError]: ' + err.message;
                }
            };
            function formatArgs(args) {
                var useColors = this.useColors;

                args[0] = (useColors ? '%c' : '')
                    + this.namespace
                    + (useColors ? ' %c' : ' ')
                    + args[0]
                    + (useColors ? '%c ' : ' ')
                    + '+' + exports.humanize(this.diff);

                if (!useColors) return;

                var c = 'color: ' + this.color;
                args.splice(1, 0, c, 'color: inherit')

                var index = 0;
                var lastC = 0;
                args[0].replace(/%[a-zA-Z%]/g, function(match) {
                    if ('%%' === match) return;
                    index++;
                    if ('%c' === match) {
                        lastC = index;
                    }
                });

                args.splice(lastC, 0, c);
            }

            function log() {
                return 'object' === typeof console
                && console.log
                && Function.prototype.apply.call(console.log, console, arguments);
            }

            function save(namespaces) {
                try {
                    if (null == namespaces) {
                        exports.storage.removeItem('debug');
                    } else {
                        exports.storage.debug = namespaces;
                    }
                } catch(e) {}
            }
            function load() {
                var r;
                try {
                    r = exports.storage.debug;
                } catch(e) {}
                if (!r && typeof process !== 'undefined' && 'env' in process) {
                    r = process.env.DEBUG;
                }

                return r;
            }
            exports.enable(load());

            function localstorage() {
                try {
                    return window.localStorage;
                } catch (e) {}
            }

            }.call(exports, __webpack_require__(90)))

        /***/ }),
    /* 193 */
    /***/ (function(module, exports, __webpack_require__) {

        exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
        exports.coerce = coerce;
        exports.disable = disable;
        exports.enable = enable;
        exports.enabled = enabled;
        exports.humanize = __webpack_require__(194);

        exports.names = [];
        exports.skips = [];
        exports.formatters = {};
        var prevTime;
        function selectColor(namespace) {
            var hash = 0, i;

            for (i in namespace) {
                hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
                hash |= 0;
            }

            return exports.colors[Math.abs(hash) % exports.colors.length];
        }

        function createDebug(namespace) {

            function debug() {
                if (!debug.enabled) return;
                var self = debug;
                var curr = +new Date();
                var ms = curr - (prevTime || curr);
                self.diff = ms;
                self.prev = prevTime;
                self.curr = curr;
                prevTime = curr;

                var args = new Array(arguments.length);
                for (var i = 0; i < args.length; i++) {
                    args[i] = arguments[i];
                }

                args[0] = exports.coerce(args[0]);

                if ('string' !== typeof args[0]) {
                    args.unshift('%O');
                }

                var index = 0;
                args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
                    if (match === '%%') return match;
                    index++;
                    var formatter = exports.formatters[format];
                    if ('function' === typeof formatter) {
                        var val = args[index];
                        match = formatter.call(self, val);
                        args.splice(index, 1);
                        index--;
                    }
                    return match;
                });
                exports.formatArgs.call(self, args);

                var logFn = debug.log || exports.log || console.log.bind(console);
                logFn.apply(self, args);
            }

            debug.namespace = namespace;
            debug.enabled = exports.enabled(namespace);
            debug.useColors = exports.useColors();
            debug.color = selectColor(namespace);
            if ('function' === typeof exports.init) {
                exports.init(debug);
            }

            return debug;
        }
        function enable(namespaces) {
            exports.save(namespaces);

            exports.names = [];
            exports.skips = [];

            var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
            var len = split.length;

            for (var i = 0; i < len; i++) {
                if (!split[i]) continue; // ignore empty strings
                namespaces = split[i].replace(/\*/g, '.*?');
                if (namespaces[0] === '-') {
                    exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
                } else {
                    exports.names.push(new RegExp('^' + namespaces + '$'));
                }
            }
        }

        function disable() {
            exports.enable('');
        }

        function enabled(name) {
            var i, len;
            for (i = 0, len = exports.skips.length; i < len; i++) {
                if (exports.skips[i].test(name)) {
                    return false;
                }
            }
            for (i = 0, len = exports.names.length; i < len; i++) {
                if (exports.names[i].test(name)) {
                    return true;
                }
            }
            return false;
        }

        function coerce(val) {
            if (val instanceof Error) return val.stack || val.message;
            return val;
        }


        /***/ }),
    /* 194 */
    /***/ (function(module, exports) {

        'use strict';

        var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

        var s = 1000;
        var m = s * 60;
        var h = m * 60;
        var d = h * 24;
        var y = d * 365.25;

        module.exports = function (val, options) {
            options = options || {};
            var type = typeof val === 'undefined' ? 'undefined' : _typeof(val);
            if (type === 'string' && val.length > 0) {
                return parse(val);
            } else if (type === 'number' && isNaN(val) === false) {
                return options.long ? fmtLong(val) : fmtShort(val);
            }
            throw new Error('val is not a non-empty string or a valid number. val=' + JSON.stringify(val));
        };

        function parse(str) {
            str = String(str);
            if (str.length > 100) {
                return;
            }
            var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(str);
            if (!match) {
                return;
            }
            var n = parseFloat(match[1]);
            var type = (match[2] || 'ms').toLowerCase();
            switch (type) {
                case 'years':
                case 'year':
                case 'yrs':
                case 'yr':
                case 'y':
                    return n * y;
                case 'days':
                case 'day':
                case 'd':
                    return n * d;
                case 'hours':
                case 'hour':
                case 'hrs':
                case 'hr':
                case 'h':
                    return n * h;
                case 'minutes':
                case 'minute':
                case 'mins':
                case 'min':
                case 'm':
                    return n * m;
                case 'seconds':
                case 'second':
                case 'secs':
                case 'sec':
                case 's':
                    return n * s;
                case 'milliseconds':
                case 'millisecond':
                case 'msecs':
                case 'msec':
                case 'ms':
                    return n;
                default:
                    return undefined;
            }
        }
        function fmtShort(ms) {
            if (ms >= d) {
                return Math.round(ms / d) + 'd';
            }
            if (ms >= h) {
                return Math.round(ms / h) + 'h';
            }
            if (ms >= m) {
                return Math.round(ms / m) + 'm';
            }
            if (ms >= s) {
                return Math.round(ms / s) + 's';
            }
            return ms + 'ms';
        }

        function fmtLong(ms) {
            return plural(ms, d, 'day') || plural(ms, h, 'hour') || plural(ms, m, 'minute') || plural(ms, s, 'second') || ms + ' ms';
        }

        function plural(ms, n, name) {
            if (ms < n) {
                return;
            }
            if (ms < n * 1.5) {
                return Math.floor(ms / n) + ' ' + name;
            }
            return Math.ceil(ms / n) + ' ' + name + 's';
        }

        /***/ }),
    /* 195 */
    /***/ (function(module, exports, __webpack_require__) {

        var map = {
            "./ArrowTowerModel": 196,
            "./ArrowTowerModel.ts": 196,
            "./BombTowerModel": 203,
            "./BombTowerModel.ts": 203,
            "./CannonTowerModel": 204,
            "./CannonTowerModel.ts": 204,
            "./CharacterModel": 205,
            "./CharacterModel.ts": 205,
            "./DoorModel": 206,
            "./DoorModel.ts": 206,
            "./ExperienceBar": 208,
            "./ExperienceBar.ts": 208,
            "./GoldMineModel": 210,
            "./GoldMineModel.ts": 210,
            "./GoldStashModel": 211,
            "./GoldStashModel.ts": 211,
            "./HarvesterModel": 212,
            "./HarvesterModel.ts": 212,
            "./HealTowersSpellModel": 215,
            "./HealTowersSpellModel.ts": 215,
            "./HealthBar": 200,
            "./HealthBar.ts": 200,
            "./MageTowerModel": 216,
            "./MageTowerModel.ts": 216,
            "./MeleeTowerModel": 217,
            "./MeleeTowerModel.ts": 217,
            "./NeutralCampModel": 218,
            "./NeutralCampModel.ts": 218,
            "./NeutralModel": 219,
            "./NeutralModel.ts": 219,
            "./PathNodeModel": 220,
            "./PathNodeModel.ts": 220,
            "./PetModel": 221,
            "./PetModel.ts": 221,
            "./PlacementIndicatorModel": 222,
            "./PlacementIndicatorModel.ts": 222,
            "./PlayerModel": 223,
            "./PlayerModel.ts": 223,
            "./ProjectileArrowModel": 233,
            "./ProjectileArrowModel.ts": 233,
            "./ProjectileBombModel": 234,
            "./ProjectileBombModel.ts": 234,
            "./ProjectileCannonModel": 235,
            "./ProjectileCannonModel.ts": 235,
            "./ProjectileMageModel": 236,
            "./ProjectileMageModel.ts": 236,
            "./RangeIndicatorModel": 237,
            "./RangeIndicatorModel.ts": 237,
            "./RecoilModel": 238,
            "./RecoilModel.ts": 238,
            "./ShieldBar": 224,
            "./ShieldBar.ts": 224,
            "./SlowTrapModel": 239,
            "./SlowTrapModel.ts": 239,
            "./SpellIndicatorModel": 240,
            "./SpellIndicatorModel.ts": 240,
            "./TowerModel": 197,
            "./TowerModel.ts": 197,
            "./WallModel": 241,
            "./WallModel.ts": 241,
            "./ZombieBossModel": 242,
            "./ZombieBossModel.ts": 242,
            "./ZombieModel": 243,
            "./ZombieModel.ts": 243
        };
        function webpackContext(req) {
            return __webpack_require__(webpackContextResolve(req));
        };
        function webpackContextResolve(req) {
            return map[req] || (function() { throw new Error("Cannot find module '" + req + "'.") }());
        };
        webpackContext.keys = function webpackContextKeys() {
            return Object.keys(map);
        };
        webpackContext.resolve = webpackContextResolve;
        module.exports = webpackContext;
        webpackContext.id = 195;
        /***/ }),
    /* 196 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const TowerModel_1 = __webpack_require__(197);
        class ArrowTowerModel extends TowerModel_1.default {
            constructor() {
                super({name: 'arrow-tower'});
            }
        }
        exports.default = ArrowTowerModel;
        /***/ }),
    /* 197 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const HealthBar_1 = __webpack_require__(200);
        const ModelEntity_1 = __webpack_require__(202);
        class TowerModel extends ModelEntity_1.default {
            constructor(args) {
                super();
                this.name = args.name;
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setSize(82, 16);
                this.healthBar.setPivotPoint(82 / 2, -25);
                this.healthBar.setVisible(false);
                this.addAttachment(this.healthBar, 4);
                this.updateModel(1);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick.tier);
                    this.updateHealthBar(tick, networkEntity);
                    this.head.setRotation(tick.towerYaw - 90);
                }
                super.update.call(this, dt, user);
            };
            updateModel(tier) {
                if (tier == this.currentTier) return;
                this.currentTier = tier;
                this.removeAttachment(this.base);
                this.removeAttachment(this.head);
                if (!document.disableTowerSprite) {
                    const baseName = this.name === 'arrow-tower' || (this.name === 'mage-tower' && tier === 6) ? this.name : 'cannon-tower';
                    this.base = new SpriteEntity_1.default(`./asset/pictures/${baseName}/${baseName}-t${tier}-base.svg`);
                    this.head = new SpriteEntity_1.default(`./asset/pictures/${this.name}/${this.name}-t${tier}-head.svg`);
                } else {
                    this.base = new SpriteEntity_1.default(`./asset`);
                    this.head = new SpriteEntity_1.default(`./asset`);
                }
                this.head.setRotation(-90);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.head, 3);
            };
            updateHealthBar(tick) {
                tick.health !== tick.maxHealth ? this.healthBar.setVisible(true) : this.healthBar.setVisible(false);
            };
        }
        exports.default = TowerModel;
        /***/ }),
    /* 198 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Entity_1 = __webpack_require__(199);
        document.useBlueT6Textures = localStorage.t6BlueTextures === "true";
        document.useDefaultZombieTextures = localStorage.defaultZombieTextures === "true";
        const blueT6TexturePrefixes = [
            'arrow-tower-', 'bomb-tower-', 'cannon-tower-', 'mage-tower-', 'melee-tower-',
            'door-', 'gold-mine-', 'gold-stash-', 'harvester-', 'slow-trap-', 'wall-'
        ];
        const getT6TexturePath = (texture) => {
            if (typeof texture !== 'string') return texture;
            const textureName = texture.split('/').pop();
            const isTowerTexture = blueT6TexturePrefixes.some((prefix) => textureName.indexOf(prefix) === 0);
            if (!document.useBlueT6Textures || !isTowerTexture || texture.indexOf('-t6') === -1 || texture.indexOf('-t6-blue') !== -1 || texture.slice(-4) !== '.svg') return texture;
            return texture.replace('-t6', '-t6-blue');
        };
        const purpleT5PlayerTextureNames = new Set([
            'player-bomb-t5.svg',
            'player-bow-t5.svg',
            'player-bow-t5-hands.svg',
            'player-pickaxe-t5.svg',
            'player-spear-t5.svg'
        ]);
        const purpleT5ToolbarItems = ['Bomb', 'Bow', 'Pickaxe', 'Spear'];
        const getPurpleT5TexturePath = (texture) => {
            if (typeof texture !== 'string' || document.useBlueT6Textures || texture.slice(-4) !== '.svg') return texture;
            const textureName = texture.split('/').pop();
            if (!purpleT5PlayerTextureNames.has(textureName)) return texture;
            return texture.replace('-t5', '-t5-purple');
        };
        const getDefaultZombieTexturePath = (texture) => {
            if (typeof texture !== 'string' || !document.useDefaultZombieTextures || texture.slice(-4) !== '.svg') return texture;
            const textureName = texture.split('/').pop();
            if (!/^zombie-(blue|green|orange|purple|red|yellow)-t\d+-(base|weapon)-(winter|savannah|space|summer)\.svg$/.test(textureName)) return texture;
            return texture.replace(/-(winter|savannah|space|summer)(\.svg)$/, '$2');
        };
        const syncTierTextureModeClasses = () => {
            if (!document.body) return;
            const usePurpleT5Tools = !document.useBlueT6Textures;
            document.body.classList.toggle('use-purple-t5-tools', usePurpleT5Tools);
            let toolbarStyle = document.getElementById('purple-t5-toolbar-textures');
            if (!toolbarStyle) {
                toolbarStyle = document.createElement('style');
                toolbarStyle.id = 'purple-t5-toolbar-textures';
                (document.head || document.documentElement).appendChild(toolbarStyle);
            }
            toolbarStyle.textContent = usePurpleT5Tools ? purpleT5ToolbarItems.map((item) => `#hud-toolbar .hud-toolbar-inventory .hud-toolbar-item[data-item="${item}"][data-tier="5"]::after{background-image:url("/asset/pictures/inventory/inventory-${item.toLowerCase()}-t5-purple.svg") !important;}`).join('') : '';
        };
        if (document.body) syncTierTextureModeClasses();
        else document.addEventListener('DOMContentLoaded', syncTierTextureModeClasses, { once: true });
        const biomeTextureAnchors = [
            { name: "winter", x: 6750, y: 6750 },
            { name: "savannah", x: 17250, y: 6750 },
            { name: "space", x: 6750, y: 17250 },
            { name: "summer", x: 17250, y: 17250 }
        ];
        window.getZombsBiomeNameForPosition = (x, y) => {
            let closestBiome = biomeTextureAnchors[0].name;
            let closestDistance = Infinity;
            for (let i = 0; i < biomeTextureAnchors.length; i++) {
                const biome = biomeTextureAnchors[i];
                const dx = x - biome.x;
                const dy = y - biome.y;
                const distance = dx * dx + dy * dy;
                if (distance < closestDistance) {
                    closestDistance = distance;
                    closestBiome = biome.name;
                }
            }
            return closestBiome;
        };
        window.getZombsBiomePositionKey = (x, y, cellSize = 512) => `${Math.floor(x / cellSize)}:${Math.floor(y / cellSize)}`;
        const resolveTexturePath = (texture) => getDefaultZombieTexturePath(getPurpleT5TexturePath(getT6TexturePath(texture)));
        window.resolveTierTexturePath = resolveTexturePath;
        window.applyTierTextureMode = () => {
            syncTierTextureModeClasses();
            if (typeof game === 'undefined' || !game.renderer || !game.renderer.scene || !game.renderer.scene.getNode) return;
            !window.textures && (window.textures = new Map());
            const updateNode = (node) => {
                if (!node) return;
                if (node.__zombsOriginalTextureName) {
                    const textureName = resolveTexturePath(node.__zombsOriginalTextureName);
                    !window.textures.get(textureName) && window.textures.set(textureName, PIXI.Texture.from(textureName));
                    node.texture = window.textures.get(textureName);
                    node.__zombsTextureName = textureName;
                }
                if (node.children) {
                    for (let i = 0; i < node.children.length; i++) {
                        updateNode(node.children[i]);
                    }
                }
            };
            updateNode(game.renderer.scene.getNode());
        };
        class SpriteEntity extends Entity_1.default {
            constructor(texture) {
                super();
                let originalTexture = texture;
                if (typeof texture === 'string') {
                    texture = resolveTexturePath(texture);
                    !window.textures && (window.textures = new Map());
                    !window.textures.get(texture) && window.textures.set(texture, PIXI.Texture.from(texture));
                    texture = window.textures.get(texture);
                }
                this.sprite = new PIXI.Sprite(texture);
                if (typeof originalTexture === 'string') {
                    this.sprite.__zombsOriginalTextureName = originalTexture;
                    this.sprite.__zombsTextureName = resolveTexturePath(originalTexture);
                }
                this.sprite.anchor.x = 0.5;
                this.sprite.anchor.y = 0.5;
                this.setNode(this.sprite);
            }
            getAnchor() {
                return this.sprite.anchor;
            }
            setAnchor(x, y) {
                this.sprite.anchor.x = x;
                this.sprite.anchor.y = y;
            }
            getTint() {
                return this.node.tint;
            };
            setTint(tint) {
                this.node.tint = tint;
            }
            getBlendMode() {
                return this.node.tint;
            }
            setBlendMode(blendMode) {
                this.node.blendMode = blendMode;
            }
            getMask() {
                return this.node.mask;
            }
            setMask(entity) {
                this.node.mask = entity.getNode();
            }
            setDimensions(x, y, width, height) {
                this.sprite.x = x;
                this.sprite.y = y;
                this.sprite.width = width;
                this.sprite.height = height;
            }
        }
        exports.default = SpriteEntity;
        /***/ }),
    /* 199 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        class Entity {
            constructor(node = null) {
                this.attachments = [];
                this.parent = null;
                this.isVisible = true;
                this.shouldCull = false;
                if (node) {
                    this.setNode(node);
                } else {
                    this.setNode(new PIXI.Container());
                }
            }
            getNode() {
                return this.node;
            };
            setNode(node) {
                if (this.node) {
                    this.node = null;
                }
                this.node = node;
            };
            getParent() {
                return this.parent;
            };
            setParent(parent) {
                this.parent = parent;
            };
            getAttachments() {
                return this.attachments;
            };
            addAttachment(attachment, zIndex = 0) {
                let node = attachment.getNode();
                node.zHack = zIndex;
                attachment.setParent(this);
                this.node.addChild(attachment.getNode());
                this.attachments.push(attachment);
                this.node.children.sort((a, b) => {
                    if (a.zHack == b.zHack) return 0;
                    return a.zHack < b.zHack ? -1 : 1;
                });
            };
            removeAttachment(attachment) {
                if (!attachment) return;
                this.node.removeChild(attachment.getNode());
                attachment.setParent(null);
                var index = this.attachments.indexOf(attachment);
                if (index > -1) {
                    this.attachments.splice(index, 1);
                }
            };
            getRotation() {
                return this.node.rotation * 180 / Math.PI;
            };
            setRotation(degrees) {
                this.node.rotation = degrees * Math.PI / 180.0;
            };
            getAlpha() {
                return this.node.alpha;
            };
            setAlpha(alpha) {
                this.node.alpha = alpha;
            };
            getScale() {
                return this.node.scale;
            };
            setScale(scale) {
                this.node.scale.x = scale;
                this.node.scale.y = scale;
            };
            setScaleX(scale) {
                this.node.scale.x = scale;
            };
            getFilters() {
                return this.node.filters;
            };
            getPosition() {
                return this.node.position;
            };
            setPosition(x, y) {
                this.node.position.x = x;
                this.node.position.y = y;
            };
            getPositionX() {
                return this.node.position.x;
            };
            setPositionX(x) {
                this.node.position.x = x;
            };
            getPositionY() {
                return this.node.position.y;
            };
            setPositionY(y) {
                this.node.position.y = y;
            };
            setPivotPoint(x, y) {
                this.node.pivot.x = x;
                this.node.pivot.y = y;
            };
            getVisible() {
                return this.isVisible;
            };
            setVisible(visible) {
                this.isVisible = visible;
                this.node.visible = visible;
            };
            setShouldCull(shouldCull) {
                this.shouldCull = shouldCull;
            };
            isInViewport() {
                let currentViewport = Game_1.default.currentGame.renderer.getCurrentViewport();
                return !(this.node.position.x - this.node.width > currentViewport.x + currentViewport.width ||
                         this.node.position.y - this.node.height > currentViewport.y + currentViewport.height ||
                         this.node.position.x + this.node.width < currentViewport.x ||
                         this.node.position.y + this.node.height < currentViewport.y);
            };
            update(dt, user) {
                this.attachments.forEach(e => {
                    e.update(dt, user);
                })
            };
        }
        exports.default = Entity;
        /***/ }),
    /* 200 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Entity_1 = __webpack_require__(199);
        const DrawEntity_1 = __webpack_require__(201);
        class HealthBar extends Entity_1.default {
            constructor(barColor) {
                super();
                this.barColor = { r: 100, g: 161, b: 10 };
                this.width = 84;
                this.height = 12;
                if (barColor) {
                    this.barColor = barColor;
                }
                this.backgroundNode = new DrawEntity_1.default();
                this.backgroundNode.drawRoundedRect(0, 0, this.width, this.height, 3, { r: 0, g: 0, b: 0 });
                this.backgroundNode.setAlpha(0.3);
                this.barNode = new DrawEntity_1.default();
                this.barNode.drawRoundedRect(2, 2, this.width - 2, this.height - 2, 2, this.barColor);
                this.addAttachment(this.backgroundNode);
                this.addAttachment(this.barNode);
                this.setPivotPoint(this.width / 2, -64);
                this.setMaxHealth(100);
                this.setHealth(100);
            }
            setSize(width, height) {
                let percent = this.percent;
                this.width = width;
                this.height = height;
                this.percent = null;
                this.backgroundNode.clear();
                this.backgroundNode.drawRoundedRect(0, 0, this.width, this.height, 3, { r: 0, g: 0, b: 0 });
                this.barNode.clear();
                this.barNode.drawRoundedRect(2, 2, this.width - 2, this.height - 2, 2, this.barColor);
                this.setPivotPoint(this.width / 2, -64);
                this.setPercent(percent);
            };
            setHealth(health) {
                this.health = health;
                this.setPercent(this.health / this.maxHealth);
            };
            setMaxHealth(max) {
                this.maxHealth = max;
                this.setPercent(this.health / this.maxHealth);
            };
            setPercent(percent) {
                if (this.percent === percent) return;
                this.percent = percent;
                this.barNode.setScaleX(this.percent);
            };
            update(dt, user) {
                let tick = user;
                if (tick) {
                    this.setHealth(tick.health);
                    this.setMaxHealth(tick.maxHealth);
                }
                this.setRotation(-this.getParent().getParent().getRotation());
                super.update.call(this, dt, user);
            };
        }
        exports.default = HealthBar;
        /***/ }),
    /* 201 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        const Entity_1 = __webpack_require__(199);
        class DrawEntity extends Entity_1.default {
            constructor() {
                super();
                this.draw = new PIXI.Graphics();
                this.clear();
                this.setNode(this.draw);
            }
            drawCircle(x, y, radius, fill = null, lineFill = null, lineWidth = null) {
                if (lineWidth && lineWidth > 0) {
                    this.draw.lineStyle(lineWidth, (lineFill.r << 16) | (lineFill.g << 8) | (lineFill.b), lineFill.a);
                }
                if (fill) {
                    this.draw.beginFill((fill.r << 16) | (fill.g << 8) | (fill.b), fill.a);
                }
                this.draw.drawCircle(x, y, radius);
                if (fill) {
                    this.draw.endFill();
                }
            };
            drawRect(x1, y1, x2, y2, fill = null, lineFill = null, lineWidth = null) {
                if (lineWidth && lineWidth > 0) {
                    this.draw.lineStyle(lineWidth, (lineFill.r << 16) | (lineFill.g << 8) | (lineFill.b), lineFill.a);
                }
                if (fill) {
                    this.draw.beginFill((fill.r << 16) | (fill.g << 8) | (fill.b), fill.a);
                }
                this.draw.drawRect(x1, y1, x2 - x1, y2 - y1);
                if (fill) {
                    this.draw.endFill();
                }
            };
            drawRoundedRect(x1, y1, x2, y2, radius, fill = null, lineFill = null, lineWidth = null) {
                if (lineWidth && lineWidth > 0) {
                    this.draw.lineStyle(lineWidth, (lineFill.r << 16) | (lineFill.g << 8) | (lineFill.b), lineFill.a);
                }
                if (fill) {
                    this.draw.beginFill((fill.r << 16) | (fill.g << 8) | (fill.b), fill.a);
                }
                this.draw.drawRoundedRect(x1, y1, x2 - x1, y2 - y1, radius);
                if (fill) {
                    this.draw.endFill();
                }
            };
            getTexture() {
                return Game_1.default.currentGame.renderer.getInternalRenderer().generateTexture(this.draw);
            };
            clear() {
                this.draw.clear();
            };
        }
        exports.default = DrawEntity;
        /***/ }),
    /* 202 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Entity_1 = __webpack_require__(199);
        class ModelEntity extends Entity_1.default {
            constructor() {
                super();
                this.wasPreloaded = false;
            }
            preload() {
                this.wasPreloaded = true;
            };
            reset() {
                this.setParent(null);
            };
        }
        exports.default = ModelEntity;
        /***/ }),
    /* 203 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const TowerModel_1 = __webpack_require__(197);
        class BombTowerModel extends TowerModel_1.default {
            constructor() {
                super({name: "bomb-tower"});
            }
            update(dt, user) {
                let tick = user;
                if (tick) {
                    if (tick.firingTick) {
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                        let scaleLengthInMs = 500;
                        let scaleAmplitude = 0.6;
                        let animationPercent = Math.min(msSinceFiring / scaleLengthInMs, 1.0);
                        let deltaScale = 1 + Math.sin(animationPercent * Math.PI) * scaleAmplitude;
                        this.head.setScale(deltaScale);
                    }
                }
                super.update.call(this, dt, user);
            };
        }
        exports.default = BombTowerModel;
        /***/ }),
    /* 204 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const TowerModel_1 = __webpack_require__(197);
        class CannonTowerModel extends TowerModel_1.default {
            constructor() {
                super({name: 'cannon-tower'});
            }
        }
        exports.default = CannonTowerModel;
        /***/ }),
    /* 205 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const ModelEntity_1 = __webpack_require__(202);
        const Game_1 = __webpack_require__(2);
        class CharacterModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.lastDamagedTick = 0;
                this.lastDamagedAnimationDone = true;
                this.lastDamageTintHealth = null;
                this.damageTintIntensity = 0.25;
                this.damageTintScalesWithDamage = false;
                this.damageTintMinDamage = 0;
                this.lastFiringTick = 0;
                this.lastFiringAnimationDone = true;
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateDamageTint(tick);
                    if (this.weaponUpdateFunc) {
                        this.weaponUpdateFunc(tick, networkEntity);
                    }
                }
                super.update.call(this, dt, user);
            };
            updateDamageTint(tick) {
                let currentHealth = typeof tick.health === 'number' ? tick.health : null;
                let maxHealth = typeof tick.maxHealth === 'number' && tick.maxHealth > 0 ? tick.maxHealth : null;
                if (this.disableDamageTint) {
                    this.lastDamageTintHealth = currentHealth;
                    return;
                }
                if (tick.lastDamagedTick && (tick.lastDamagedTick !== this.lastDamagedTick || !this.lastDamagedAnimationDone)) {
                    if (tick.lastDamagedTick !== this.lastDamagedTick) {
                        let healthDrop = currentHealth !== null && this.lastDamageTintHealth !== null ? Math.max(0, this.lastDamageTintHealth - currentHealth) : 0;
                        if (this.damageTintScalesWithDamage && healthDrop < this.damageTintMinDamage) {
                            this.lastDamagedTick = tick.lastDamagedTick;
                            this.lastDamagedAnimationDone = true;
                            this.lastDamageTintHealth = currentHealth;
                            this.base.setTint(0xFFFFFF);
                            if (this.weapon) {
                                this.weapon.setTint(0xFFFFFF);
                            }
                            return;
                        }
                        let damageRatio = maxHealth ? Math.min(1, healthDrop / maxHealth) : 0;
                        let heavyDamageRatio = this.damageTintMinDamage ? Math.min(1, (healthDrop - this.damageTintMinDamage) / 1500) : 0;
                        this.damageTintIntensity = this.damageTintScalesWithDamage ? Math.min(0.42, 0.18 + damageRatio * 1.2 + heavyDamageRatio * 0.12) : 0.25;
                        this.lastDamagedTick = tick.lastDamagedTick;
                        this.lastDamagedAnimationDone = false;
                    }
                    let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.lastDamagedTick);
                    let flashDurationMs = this.damageTintScalesWithDamage ? 500 : 100;
                    let flashPercent = Math.min(msSinceFiring / flashDurationMs, 1.0);
                    let flashMultiplier = Math.sin(flashPercent * Math.PI);
                    let tintStrength = flashMultiplier * this.damageTintIntensity;
                    let shade = Math.max(120, Math.round(255 - 135 * tintStrength));
                    let tint = (shade << 16) | (shade << 8) | shade;
                    if (flashPercent === 1) {
                        tint = 0xFFFFFF;
                        this.lastDamagedAnimationDone = true;
                    }
                    this.base.setTint(tint);
                    if (this.weapon) {
                        this.weapon.setTint(tint);
                    }
                }
                this.lastDamageTintHealth = currentHealth;
            };
            updatePunchingWeapon(punchLengthInMs = 300) {
                return (tick, networkEntity) => {
                    if (tick.firingTick && (tick.firingTick !== this.lastFiringTick || !this.lastFiringAnimationDone)) {
                        this.lastFiringTick = tick.firingTick;
                        this.lastFiringAnimationDone = false;
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                        let punchPercent = Math.min(msSinceFiring / punchLengthInMs, 1.0);
                        let animationMultiplier = Math.sin(punchPercent * 2 * Math.PI) / Math.PI * -1;
                        if (punchPercent === 1) {
                            this.lastFiringAnimationDone = true;
                        }
                        this.weapon.setPositionY(20 * animationMultiplier);
                    }
                };
            };
            updateSwingingWeapon(swingLengthInMs = 300, swingAmplitude = 100) {
                return (tick, networkEntity) => {
                    if (tick.firingTick && (tick.firingTick !== this.lastFiringTick || !this.lastFiringAnimationDone)) {
                        this.lastFiringTick = tick.firingTick;
                        this.lastFiringAnimationDone = false;
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                        let swingPercent = Math.min(msSinceFiring / swingLengthInMs, 1.0);
                        let swingDeltaRotation = Math.sin(swingPercent * Math.PI) * swingAmplitude;
                        if (swingPercent === 1) {
                            this.lastFiringAnimationDone = true;
                        }
                        this.weapon.setRotation(-swingDeltaRotation);
                    }
                };
            };
            updateBowWeapon(pullLengthInMs = 300) {
                return (tick, networkEntity) => {
                    if (tick.firingTick && (tick.firingTick !== this.lastFiringTick || !this.lastFiringAnimationDone)) {
                        this.lastFiringTick = tick.firingTick;
                        this.lastFiringAnimationDone = false;
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.startChargingTick);
                        let pullPercent = Math.min(msSinceFiring / pullLengthInMs, 1.0);
                        let offsetPositionY = pullPercent < 0.75 ? 10 * (0.75 / pullPercent) : 10 - 10 * (0.25 / (pullPercent - 0.75));
                        if (pullPercent === 1) {
                            this.lastFiringAnimationDone = true;
                        }
                        this.weapon.getAttachments()[0].setPositionY(offsetPositionY);
                    }
                };
            };
        }
        exports.default = CharacterModel;
        /***/ }),
    /* 206 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const ModelEntity_1 = __webpack_require__(202);
        const SpriteEntity_1 = __webpack_require__(198);
        const HealthBar_1 = __webpack_require__(200);
        const LocalPlayer_1 = __webpack_require__(207);
        class DoorModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.currentTier = 1;
                this.base = new SpriteEntity_1.default(`./asset/pictures/door/door-t1-base.svg`);
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setSize(35, 10);
                this.healthBar.setPivotPoint(35 / 2, -8);
                this.healthBar.setVisible(false);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.healthBar, 3);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick, networkEntity);
                    this.updateVisibility(tick, networkEntity);
                    this.updateHealthBar(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            updateModel(tick, networkEntity) {
                if (tick.tier == this.currentTier) return;
                this.currentTier = tick.tier;
                this.removeAttachment(this.base);
                !document.disableTowerSprite ? this.base = new SpriteEntity_1.default(`./asset/pictures/door/door-t${this.currentTier}-base.svg`) : this.base = new SpriteEntity_1.default(`./asset`);
                this.addAttachment(this.base, 2);
            };
            updateVisibility(tick, networkEntity) {
                if (tick.partyId == LocalPlayer_1.default.getMyPartyId()) {
                    this.base.setAlpha(0.5);
                }
            };
            updateHealthBar(tick, networkEntity) {
                tick.health !== tick.maxHealth ? this.healthBar.setVisible(true) : this.healthBar.setVisible(false);
            };
        }
        exports.default = DoorModel;
        /***/ }),
    /* 207 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        class LocalPlayer {
            constructor() {}
            setEntity(entity) {
                this.entity = entity;
            };
            getEntity() {
                return this.entity;
            };
            setTargetTick() {
                Game_1.default.currentGame.ui.setPlayerTick(this.entity.targetTick);
            };
        }
        LocalPlayer.getMyPartyId = () => {
            if (!game.ui.playerTick) return 0;
            return game.ui.playerTick.partyId;
        };
        exports.default = LocalPlayer;
        /***/ }),
    /* 208 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Entity_1 = __webpack_require__(199);
        const DrawEntity_1 = __webpack_require__(201);
        const TextEntity_1 = __webpack_require__(209);
        class ExperienceBar extends Entity_1.default {
            constructor() {
                super();
                this.barColor = { r: 214, g: 170, b: 53 };
                this.width = 76;
                this.height = 8;
                this.offset = 20;
                this.experiencePerLevel = 100;
                this.level = 1;
                this.backgroundNode = new DrawEntity_1.default();
                this.backgroundNode.drawRoundedRect(this.offset, 0, this.width, this.height, 3, { r: 0, g: 0, b: 0 });
                this.backgroundNode.drawCircle(6, -4, 12, { r: 0, g: 0, b: 0 });
                this.backgroundNode.setAlpha(0.3);
                this.barNode = new DrawEntity_1.default();
                this.barNode.drawRoundedRect(2, 2, this.width - 2 - this.offset, this.height - 2, 2, this.barColor);
                this.barNode.setPosition(this.offset, 0);
                this.levelEntity = new TextEntity_1.default(this.level.toString(), 'Hammersmith One, sans-serif', 12);
                this.levelEntity.setPosition(6, -4);
                this.levelEntity.setColor(214, 170, 53);
                this.levelEntity.setAnchor(0.5, 0.5);
                this.addAttachment(this.backgroundNode);
                this.addAttachment(this.barNode);
                this.addAttachment(this.levelEntity);
                this.setPivotPoint(this.width / 2, -80);
                this.setExperience(0);
            }
            setSize(width, height) {
                var percent = this.percent;
                this.width = width;
                this.height = height;
                this.percent = null;
                this.backgroundNode.clear();
                this.backgroundNode.drawRoundedRect(this.offset, 0, this.width, this.height, 3, { r: 0, g: 0, b: 0 });
                this.backgroundNode.drawCircle(6, -3, 12, { r: 0, g: 0, b: 0 });
                this.barNode.clear();
                this.barNode.drawRoundedRect(2, 2, this.width - 2 - this.offset, this.height - 2, 2, this.barColor);
                this.barNode.setPosition(this.offset, 0);
                this.setPivotPoint(this.width / 2, -80);
                this.setPercent(percent);
            };
            setExperience(experience) {
                this.experience = experience;
                this.setPercent((((this.experience % this.experiencePerLevel) | 0) / 100));
                this.setLevel((this.experience / 100 + 1) | 0);
            };
            setPercent(percent) {
                if (this.percent === percent) return;
                this.percent = percent;
                this.barNode.setScaleX(this.percent);
            };
            setLevel(level) {
                this.level = level;
                this.levelEntity.setString(this.level.toString());
            };
            update(dt, user) {
                let tick = user;
                if (tick) {
                    this.setExperience(tick.experience);
                }
                this.setRotation(-this.getParent().getParent().getRotation());
                super.update.call(this, dt, user);
            };
        }
        exports.default = ExperienceBar;
        /***/ }),
    /* 209 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Entity_1 = __webpack_require__(199);
        class TextEntity extends Entity_1.default {
            constructor(text, fontName, fontSize) {
                super();
                this.text = new PIXI.Text(text, {fontFamily: fontName, fontSize: fontSize, lineJoin: 'round', padding: 10});
                this.text.resolution = 2 * window.devicePixelRatio;
                this.setNode(this.text);
            }
            setColor(r, g, b) {
                this.text.style.fill = (r << 16) | (g << 8) | b;
            };
            setStroke(r, g, b, thickness) {
                this.text.style.stroke = (r << 16) | (g << 8) | b;
                this.text.style.strokeThickness = thickness;
            };
            setFontWeight(weight) {
                this.text.style.fontWeight = weight;
            };
            setLetterSpacing(spacing) {
                this.text.style.letterSpacing = spacing;
            };
            setAnchor(x, y) {
                this.text.anchor.set(x, y);
            };
            setString(text) {
                this.text.text = text;
            };
        }
        exports.default = TextEntity;
        /***/ }),
    /* 210 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const ModelEntity_1 = __webpack_require__(202);
        const SpriteEntity_1 = __webpack_require__(198);
        const HealthBar_1 = __webpack_require__(200);
        class GoldMineModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.currentTier = 1;
                this.currentRotation = 0;
                this.base = new SpriteEntity_1.default(`./asset/pictures/gold-mine/gold-mine-t${this.currentTier}-base.svg`);
                this.head = new SpriteEntity_1.default(`./asset/pictures/gold-mine/gold-mine-t${this.currentTier}-head.svg`);
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setSize(82, 16);
                this.healthBar.setPivotPoint(82 / 2, -25);
                this.healthBar.setVisible(false);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.head, 3);
                this.addAttachment(this.healthBar, 4);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick, networkEntity);
                    this.updateHealthBar(tick, networkEntity);
                    this.currentRotation += this.currentTier / 2;
                    this.head && this.head.setRotation(this.currentRotation % 360);
                }
                super.update.call(this, dt, user);
            };
            updateModel(tick, networkEntity) {
                if (tick.tier == this.currentTier) return;
                this.currentTier = tick.tier;
                this.removeAttachment(this.base);
                this.removeAttachment(this.head);
                !document.disableTowerSprite ? (this.base = new SpriteEntity_1.default(`./asset/pictures/cannon-tower/cannon-tower-t${this.currentTier}-base.svg`), this.head = new SpriteEntity_1.default(`./asset/pictures/gold-mine/gold-mine-t${this.currentTier}-head.svg`)) : (this.base = new SpriteEntity_1.default(`./asset`), this.head = new SpriteEntity_1.default(`./asset`));
                this.addAttachment(this.base, 2);
                this.addAttachment(this.head, 3);
            };
            updateHealthBar(tick, networkEntity) {
                tick.health !== tick.maxHealth ? this.healthBar.setVisible(true) : this.healthBar.setVisible(false);
            };
        }
        exports.default = GoldMineModel;
        /***/ }),
    /* 211 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const ModelEntity_1 = __webpack_require__(202);
        const SpriteEntity_1 = __webpack_require__(198);
        const HealthBar_1 = __webpack_require__(200);
        class GoldStashModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.currentTier = 1;
                this.base = new SpriteEntity_1.default(`./asset/pictures/gold-stash/entities-gold-stash.svg`);
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setSize(82, 16);
                this.healthBar.setPivotPoint(82 / 2, -25);
                this.healthBar.setVisible(false);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.healthBar, 3);
            } 
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick, networkEntity);
                    this.updateHealthBar(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            updateModel(tick, networkEntity) {
                if (tick.tier == this.currentTier) return;
                this.currentTier = tick.tier;
                this.removeAttachment(this.base);
                !document.disableTowerSprite ? this.base = new SpriteEntity_1.default(`./asset/pictures/gold-stash/gold-stash-t${this.currentTier}-base.svg`) : this.base = new SpriteEntity_1.default(`./asset`);
                this.addAttachment(this.base, 2);
            };
            updateHealthBar(tick, networkEntity) {
                if (tick.health !== tick.maxHealth) {
                    this.healthBar.setVisible(true);
                } else {
                    this.healthBar.setVisible(false);
                }
            };         
        }
        exports.default = GoldStashModel;
        /***/ }),
    /* 212 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const ModelEntity_1 = __webpack_require__(202);
        const DrawEntity_1 = __webpack_require__(201);
        const SpriteEntity_1 = __webpack_require__(198);
        const HealthBar_1 = __webpack_require__(200);
        const Util_1 = __webpack_require__(213);
        class HarvesterModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.animationTick = 0;
                this.harvestGlowHoldDuration = 2500;
                this.harvestClumpIcons = [];
                this.harvestClumpElapsed = 9999;
                this.harvestClumpDuration = 850;
                this.pendingHarvestClumpIconType = null;
                this.pendingHarvestClumpElapsed = 0;
                this.pendingHarvestClumpDelay = 465;
                this.colorMapping = {'1': {arm: '#845e48', pivot: '#666'}, '2': {arm: '#666', pivot: '#c69c6d'}, '3': {arm: '#c69c6d', pivot: '#ccc'}, '4': {arm: '#ccc', pivot: '#fbb03b'}, '5': {arm: '#fbb03b', pivot: '#d8d8d8'}, '6': {arm: '#9f45f0', pivot: '#c38aff'}, '7': {arm: '#ba363f', pivot: '#666'}, '8': {arm: '#41f384', pivot: '#666'}};
                this.barBackgrounds = new DrawEntity_1.default();
                this.barBackgrounds.setPivotPoint(23, -16);
                this.barBackgrounds.setAlpha(0.4);
                this.fillBar = new DrawEntity_1.default();
                this.fillBar.setPivotPoint(23, -16);
                this.fuelBar = new DrawEntity_1.default();
                this.fuelBar.setPivotPoint(23, -16);
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setSize(82, 16);
                this.healthBar.setPivotPoint(82 / 2, -25);
                this.healthBar.setVisible(false);
                this.addAttachment(this.healthBar, 4);
                this.addAttachment(this.barBackgrounds, 4);
                this.addAttachment(this.fillBar, 4);
                this.addAttachment(this.fuelBar, 4);
                this.updateModel(1);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick.tier);
                    this.updateAnimation(tick);
                    this.updateHarvestClump(dt);
                    this.updateStatusBars(tick);
                    this.updateHealthBar(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            updateModel(tier) {
                const textureMode = tier === 6 && document.useBlueT6Textures ? 'blue' : 'normal';
                if (tier == this.currentTier && textureMode === this.currentTextureMode) return;
                this.currentTier = tier;
                this.currentTextureMode = textureMode;
                this.removeAttachment(this.base);
                this.removeAttachment(this.harvestGlow);
                this.clearHarvestResourceIcons();
                this.removeAttachment(this.pivotPointHead);
                this.removeAttachment(this.head);
                this.base = new SpriteEntity_1.default(`./asset/pictures/cannon-tower/cannon-tower-t${this.currentTier}-base.svg`);
                this.head = new SpriteEntity_1.default(`./asset/pictures/harvester/harvester-t${this.currentTier}-head.svg`);
                this.head.setPivotPoint(10, 0);
                this.pivotPointFar = new DrawEntity_1.default();
                const tierColor = this.currentTier === 6 && document.useBlueT6Textures ? { arm: '#60a5fa', pivot: '#f0f0f0' } : this.colorMapping[this.currentTier];
                this.pivotPointFar.drawCircle(0, 0, 8, Util_1.default.hexToRgb(tierColor.pivot), { r: 51, g: 51, b: 51 }, 5);
                this.pivotPointFar.setPosition(8, 0);
                this.harvestGlow = new DrawEntity_1.default();
                this.harvestGlow.setAlpha(0.26);
                this.armFar = new DrawEntity_1.default();
                this.armFar.drawRoundedRect(0, 0, 16, 24, 8, Util_1.default.hexToRgb(tierColor.arm), { r: 51, g: 51, b: 51 }, 5);
                this.armFar.addAttachment(this.pivotPointFar);
                this.armFar.setPivotPoint(8, 24);
                this.pivotPointClose = new DrawEntity_1.default();
                this.pivotPointClose.drawCircle(0, 0, 10, Util_1.default.hexToRgb(tierColor.pivot), { r: 51, g: 51, b: 51 }, 5);
                this.pivotPointClose.addAttachment(this.armFar);
                this.pivotPointClose.setPosition(8, 0);
                this.armClose = new DrawEntity_1.default();
                this.armClose.drawRoundedRect(0, 0, 16, 40, 8, Util_1.default.hexToRgb(tierColor.arm), { r: 51, g: 51, b: 51 }, 5);
                this.armClose.addAttachment(this.pivotPointClose);
                this.armClose.setPivotPoint(8, 40);
                this.pivotPointHead = new DrawEntity_1.default();
                this.pivotPointHead.drawCircle(0, 0, 10, Util_1.default.hexToRgb(tierColor.pivot), { r: 51, g: 51, b: 51 }, 5);
                this.pivotPointHead.addAttachment(this.armClose);
                this.pivotPointHead.setPosition(0, -20);
                this.head.setRotation(-90);
                this.pivotPointHead.setRotation(80);
                this.pivotPointClose.setRotation(-160);
                this.currentClawState = null;
                this.setClawState('idle');
                this.currentHarvestResourceIconType = null;
                this.currentHarvestDisplayType = null;
                this.currentHarvestGlowType = null;
                this.clearHarvestClumpIcons();
                this.addAttachment(this.harvestGlow, 1);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.pivotPointHead, 2);
                this.addAttachment(this.head, 3);
            };
            setClawState(state) {
                if (state === this.currentClawState) return;
                this.currentClawState = state;
                if (this.claw) this.pivotPointFar.removeAttachment(this.claw);
                const suffix = state === 'idle' ? '' : `-${state}`;
                this.claw = new SpriteEntity_1.default(`./asset/pictures/harvester/harvester-t${this.currentTier}-claw${suffix}.svg`);
                this.claw.setPivotPoint(0, this.claw.getNode().height / 2);
                this.pivotPointFar.addAttachment(this.claw);
            };
            setHarvestResourceIcon(type) {
                if (type === this.currentHarvestResourceIconType) return;
                this.currentHarvestResourceIconType = type;
                this.clearHarvestResourceIcons();
                if (type === 'none') return;
                let icons = type.split('+');
                let iconCount = icons.length;
                this.harvestResourceIcons = [];
                icons.forEach((iconType, index) => {
                    const iconCenterX = 1;
                    let scale = iconCount <= 2 ? 0.78 : iconCount === 3 ? 0.66 : 0.56;
                    if (iconType === 'heart') scale = 0.95;
                    let spacingX = iconCount <= 2 ? 25 : iconCount === 3 ? 20 : 16;
                    let x = iconCenterX + (index - (iconCount - 1) / 2) * spacingX;
                    let y = 35;
                    if (iconCount === 1) {
                        scale = iconType === 'heart' ? 1.02 : 0.78;
                        x = iconCenterX;
                        y = iconType === 'heart' ? 33 : 35;
                    }
                    let icon = new SpriteEntity_1.default(`./asset/pictures/harvester/harvester-resource-${iconType}.svg`);
                    icon.setPosition(x, y);
                    icon.setScale(scale);
                    this.harvestResourceIcons.push(icon);
                    this.addAttachment(icon, 5);
                });
            };
            clearHarvestResourceIcons() {
                if (!this.harvestResourceIcons) this.harvestResourceIcons = [];
                this.harvestResourceIcons.forEach((icon) => this.removeAttachment(icon));
                this.harvestResourceIcons = [];
            };
            clearHarvestClumpIcons() {
                if (!this.harvestClumpIcons) this.harvestClumpIcons = [];
                this.harvestClumpIcons.forEach((icon) => {
                    if (this.pivotPointFar) {
                        this.pivotPointFar.removeAttachment(icon);
                    }
                });
                this.harvestClumpIcons = [];
            };
            spawnHarvestClump(iconType) {
                if (!this.pivotPointFar || !iconType || iconType === 'none') return;
                this.clearHarvestClumpIcons();
                let resourceIcons = [];
                iconType.split('+').forEach((icon) => {
                    if (icon === 'both') {
                        resourceIcons.push('wood', 'stone');
                    } else if (icon === 'wood' || icon === 'stone') {
                        resourceIcons.push(icon);
                    }
                });
                resourceIcons = resourceIcons.slice(0, 8);
                const offsets = [
                    { x: -5, y: -23 }, { x: 2, y: -16 }, { x: -6, y: -12 }, { x: 3, y: -29 },
                    { x: -12, y: -18 }, { x: 10, y: -21 }, { x: -10, y: -29 }, { x: 10, y: -11 }
                ];
                resourceIcons.forEach((iconType, index) => {
                    let icon = new SpriteEntity_1.default(`./asset/pictures/harvester/harvester-resource-${iconType}.svg`);
                    let offset = offsets[index] || offsets[offsets.length - 1];
                    icon.setPosition(offset.x, offset.y);
                    icon.setScale(0.54);
                    icon.setAlpha(0.95);
                    this.harvestClumpIcons.push(icon);
                    this.pivotPointFar.addAttachment(icon, 3);
                });
                this.harvestClumpElapsed = 0;
            };
            updateHarvestClump(dt) {
                if (this.pendingHarvestClumpIconType) {
                    this.pendingHarvestClumpElapsed += dt;
                    if (this.pendingHarvestClumpElapsed >= this.pendingHarvestClumpDelay) {
                        let iconType = this.pendingHarvestClumpIconType;
                        this.pendingHarvestClumpIconType = null;
                        this.spawnHarvestClump(iconType);
                    }
                }
                if (!this.harvestClumpIcons || this.harvestClumpIcons.length === 0) return;
                this.harvestClumpElapsed += dt;
                let percent = Math.min(this.harvestClumpElapsed / this.harvestClumpDuration, 1);
                let alpha = 1 - percent;
                this.harvestClumpIcons.forEach((icon) => icon.setAlpha(alpha));
                if (percent >= 1) {
                    this.clearHarvestClumpIcons();
                }
            };
            getHarvestUnit(tier) {
                const amounts = [3, 6, 6, 10, 12, 15, 20, 24];
                return amounts[Math.max(0, Math.min(amounts.length - 1, tier - 1))];
            };
            getHarvestCount(delta, tier) {
                if (delta <= 0) return 0;
                return Math.max(1, Math.min(5, Math.round(delta / this.getHarvestUnit(tier))));
            };
            getHarvestState(tick) {
                let woodDelta = this.lastHarvestWood === undefined ? 0 : tick.wood - this.lastHarvestWood;
                let stoneDelta = this.lastHarvestStone === undefined ? 0 : tick.stone - this.lastHarvestStone;
                this.lastHarvestWood = tick.wood;
                this.lastHarvestStone = tick.stone;
                let woodCount = this.getHarvestCount(woodDelta, tick.tier);
                let stoneCount = this.getHarvestCount(stoneDelta, tick.tier);
                if (woodCount === 0 && stoneCount === 0) return { glowType: 'none', iconType: 'none' };
                let stars = Math.min(woodCount, stoneCount);
                let icons = [];
                for (let i = 0; i < stars; i++) icons.push('both');
                for (let i = 0; i < woodCount - stars; i++) icons.push('wood');
                for (let i = 0; i < stoneCount - stars; i++) icons.push('stone');
                icons = icons.slice(0, 5);
                let glowType = woodCount >= 2 && stoneCount >= 2
                    ? 'quad'
                    : (woodCount === 2 && stoneCount === 1) || (woodCount === 1 && stoneCount === 2)
                        ? 'combo'
                        : woodCount > 0 && stoneCount > 0
                            ? 'double'
                        : woodCount > 0
                            ? woodCount >= 2 ? 'double' : 'wood'
                            : stoneCount >= 2 ? 'double' : 'stone';
                return { glowType, iconType: icons.join('+') };
            };
            updateHarvestGlow(tick) {
                let harvestState = this.getHarvestState(tick);
                if (harvestState.glowType !== 'none') {
                    this.lastHarvestResourceIconType = harvestState.iconType;
                    this.pendingHarvestClumpIconType = harvestState.iconType;
                    this.pendingHarvestClumpElapsed = 0;
                }
                let iconType = this.lastHarvestResourceIconType || 'heart';
                let glowType = `tier-${this.currentTier}`;
                let displayType = `${glowType}|${iconType}`;
                if (displayType === this.currentHarvestDisplayType) {
                    this.updateHarvestIconRotation(tick);
                    return;
                }
                this.currentHarvestDisplayType = displayType;
                this.currentHarvestGlowType = glowType;
                this.setHarvestResourceIcon(iconType);
                this.updateHarvestIconRotation(tick);
                this.harvestGlow.clear();
            };
            updateHarvestIconRotation(tick) {
                if (!this.harvestResourceIcons) return;
                let yaw = ((tick.yaw % 360) + 360) % 360;
                let sideFacing = yaw > 45 && yaw < 135 || yaw > 225 && yaw < 315;
                let downFacing = yaw >= 135 && yaw <= 225;
                let iconRotation = sideFacing ? -tick.yaw : downFacing ? -180 : 0;
                this.harvestResourceIcons.forEach((icon) => icon.setRotation(iconRotation));
            };
            updateAnimation(tick) {
                if (!tick.firingTick) {
                    this.setClawState('idle');
                    return;
                }
                let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                let animationDuration = 750;
                let animationPercent = Math.min(msSinceFiring / animationDuration, 1.0);
                let rotationRatio = 1 - Math.sin(animationPercent * Math.PI);
                this.pivotPointHead.setRotation(10 + rotationRatio * 70);
                this.pivotPointClose.setRotation(-20 + rotationRatio * 70 * -2);
                if (animationPercent >= 1) {
                    this.setClawState('idle');
                } else if (animationPercent < 0.42) {
                    this.setClawState('idle');
                } else if (animationPercent < 0.62) {
                    this.setClawState('grab');
                } else {
                    this.setClawState('carry');
                }
            };
            updateStatusBars(tick) {
                this.updateHarvestGlow(tick);
                this.barBackgrounds.clear();
                this.fillBar.clear();
                this.fuelBar.clear();
            };
            updateHealthBar(tick, networkEntity) {
                if (tick.health !== tick.maxHealth) {
                    this.healthBar.setVisible(true);
                } else {
                    this.healthBar.setVisible(false);
                }
                this.healthBar.setHealth(tick.health);
                this.healthBar.setMaxHealth(tick.maxHealth);
                this.healthBar.setRotation(-tick.yaw);
            };
        }
        exports.default = HarvesterModel;
        /***/ }),
    /* 213 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const Util_1 = __webpack_require__(214);
        class Util extends Util_1.default {
            constructor() {
                super();
            }
        }
        Util.hexToRgb = (hex) => {
            let shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
            hex = hex.replace(shorthandRegex, (m, r, g, b) => (r + r + g + g + b + b));
            let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        };
        Util.canAfford = (data, tier = 1, multiplier = 1) => {
            let resources = { wood: 'wood', stone: 'stone', gold: 'gold', token: 'tokens' };
            let canAfford = true;
            let playerTick = Game_1.default.currentGame.ui.getPlayerTick();
            for (const resourceId in resources) {
                let resourceKey = resourceId + 'Costs';
                if (data[resourceKey] && data[resourceKey][tier - 1]) {
                    let rawCost = data[resourceKey][tier - 1] * multiplier;
                    canAfford = canAfford && playerTick && playerTick.wood >= rawCost;
                }
            }
            return canAfford;
        };
        Util.createResourceCostString = (data, tier = 1, multiplier = 1) => {
            let resourceCosts = [];
            let resources = { wood: 'wood', stone: 'stone', gold: 'gold', token: 'tokens' };
            let playerTick = Game_1.default.currentGame.ui.getPlayerTick();
            for (const resourceId in resources) {
                let resourceKey = resourceId + 'Costs';
                if (data[resourceKey] && data[resourceKey][tier - 1]) {
                    let rawCost = data[resourceKey][tier - 1] * multiplier;
                    let canAfford = playerTick && playerTick[resourceId] >= rawCost;
                    if (canAfford) {
                        resourceCosts.push("<span class=\"hud-resource-" + resources[resourceId] + "\">" + rawCost.toLocaleString() + " " + resources[resourceId] + "</span>");
                    } else {
                        resourceCosts.push("<span class=\"hud-resource-" + resources[resourceId] + " hud-resource-low\">" + rawCost.toLocaleString() + " " + resources[resourceId] + "</span>");
                    }
                }
            }
            if (resourceCosts.length > 0) {
                return resourceCosts.join(', ');
            }
            return "<span class=\"hud-resource-free\">Free</span>";
        };
        Util.createResourceRefundString = (data, tier = 1, multiplier = 1) => {
            let resourcesRefunded = [];
            let resources = { wood: 'wood', stone: 'stone', gold: 'gold', token: 'tokens' };
            for (const resourceId in resources) {
                let resourceKey = resourceId + 'Costs';
                if (data[resourceKey]) {
                    let rawRefund = Math.floor(data[resourceKey].slice(0, tier).reduce((a, b) => a + b, 0) / 2) * multiplier;
                    if (rawRefund) {
                        resourcesRefunded.push("<span class=\"hud-resource-" + resources[resourceId] + "\">" + rawRefund.toLocaleString() + " " + resources[resourceId] + "</span>");
                    }
                }
            }
            if (resourcesRefunded.length > 0) {
                return resourcesRefunded.join(', ');
            }
            return "<span class=\"hud-resource-free\">None</span>";
        };
        exports.default = Util;
        /***/ }),
    /* 214 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        class Util {
            constructor() {
            }
        }
        Util.lerp = (start, end, ratio) => (start + (end - start) * (ratio > 1.2 ? 1 : ratio)) | 0;
        Util.mod = (a, b) => ((a % b + b) % b) | 0;
        Util.interpolateYaw = (target, from) => {
            let tickPercent = game.world.replicator.msInThisTick / 50;
            let rotationalDifference = Util.lerp(0, Util.mod(target - from + 180, 360) - 180, tickPercent) | 0;
            let yaw = (from + rotationalDifference) | 0;
            return ((yaw + 360) % 360) | 0;
        };
        Util.angleTo = (xFrom, yFrom, xTo, yTo) => {
            return ((Math.atan2(yTo - yFrom, xTo - xFrom) / (Math.PI/180) + 450) % 360) | 0;
        };
        Util.isMobile = () => {
            if (!Util.checkedIfMobile) {
                Util.actuallyIsMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
                Util.checkedIfMobile = true;
            }
            return Util.actuallyIsMobile;
        };
        Util.checkedIfMobile = false;
        Util.actuallyIsMobile = false;
        exports.default = Util;
        /***/ }),
    /* 215 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const ModelEntity_1 = __webpack_require__(202);
        const DrawEntity_1 = __webpack_require__(201);
        class HealTowersSpellModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.hearts = {};
                this.heartOffsets = {};
                this.currentRadius = 0;
                this.currentPulse = 0;
                this.heartMaxOffset = 50;
                this.heartSpawnTolerance = 0.1;
                this.heartTotal = 10;
                this.ui = Game_1.default.currentGame.ui;
                let spellSchema = this.ui.getSpellSchema();
                let schemaData = spellSchema.HealTowersSpell;
                this.currentRadius = schemaData.rangeTiers[0] / 2;
                this.circle = new DrawEntity_1.default();
                this.circle.drawCircle(0, 0, this.currentRadius, { r: 216, g: 0, b: 39, a: 0.002 }, { r: 216, g: 77, b: 92, a: 0.004 }, 8);
                this.circle.setAlpha(0.001);
                document.showSpawnCircle = document.showSpawnCircle === true;
                document.spawnCircleNodes = document.spawnCircleNodes || [];
                document.spawnCircleNodes.push(this.circle);
                this.circle.setVisible(document.showSpawnCircle);
                this.addAttachment(this.circle);
            }
            update(dt, user) {
                let tick = user;
                if (tick) {
                    this.updatePulse();
                    this.updateHearts();
                }
                super.update.call(this, dt, user);
            };
            updatePulse() {
                this.currentPulse += 0.01;
                this.circle.setAlpha(0.001 + 0.0004 * Math.sin(this.currentPulse * 2 * Math.PI));
            };
            updateHearts() {
                return "";
            }
        }
        exports.default = HealTowersSpellModel;
        /***/ }),
    /* 216 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const TowerModel_1 = __webpack_require__(197);
        class MageTowerModel extends TowerModel_1.default {
            constructor() {
                super({name: 'mage-tower'});
            }
            update(dt, user) {
                let tick = user;
                if (tick) {
                    if (tick.firingTick) {
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                        let scaleLengthInMs = 250;
                        let scaleAmplitude = 0.4;
                        let animationPercent = Math.min(msSinceFiring / scaleLengthInMs, 1.0);
                        let deltaScale = 1 + Math.sin(animationPercent * Math.PI) * scaleAmplitude;
                        this.head.setScale(deltaScale);
                    }
                }
                super.update.call(this, dt, user);
            };
        }
        exports.default = MageTowerModel;
        /***/ }),
    /* 217 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const DrawEntity_1 = __webpack_require__(201);
        const SpriteEntity_1 = __webpack_require__(198);
        const TowerModel_1 = __webpack_require__(197);
        class MeleeTowerModel extends TowerModel_1.default {
            constructor() {
                super({name: 'melee-tower'});
                this.middleMask = new DrawEntity_1.default();
                this.middleMask.drawRect(20, -50, 100, 50, { r: 0, g: 0, b: 0 });
                this.addAttachment(this.middleMask);
                this.currentTier = null;
                this.updateModel(1);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick.tier);
                    this.updateAnimation(tick);
                    this.updateHealthBar(tick, networkEntity);
                }
            };
            updateModel(tier) {
                if (tier == this.currentTier) return;
                this.currentTier = tier;
                this.removeAttachment(this.base);
                this.removeAttachment(this.middle);
                this.removeAttachment(this.head);
                this.base = new SpriteEntity_1.default(`./asset/pictures/cannon-tower/cannon-tower-t${this.currentTier}-base.svg`);
                this.middle = new SpriteEntity_1.default(`./asset/pictures/melee-tower/melee-tower-t${this.currentTier}-middle.svg`);
                this.middle.setAnchor(0, 0.5);
                this.middle.setPositionY(32);
                this.head = new SpriteEntity_1.default(`./asset/pictures/melee-tower/melee-tower-t${this.currentTier}-head.svg`);
                this.head.setAnchor(0, 0.5);
                this.head.setPositionY(36);
                this.head.setRotation(-90);
                this.middle.setRotation(-90);
                if (this.middleMask) {
                    this.middleMask.setRotation(-90);
                }
                this.addAttachment(this.base, 1);
                this.addAttachment(this.middle, 2);
                this.addAttachment(this.head, 3);
                if (this.middleMask) {
                    this.middle.setMask(this.middleMask);
                }
            };
            updateHealthBar(tick, networkEntity) {
                super.updateHealthBar.call(this, tick, networkEntity);
                this.healthBar.setHealth(tick.health);
                this.healthBar.setMaxHealth(tick.maxHealth);
                this.healthBar.setRotation(-tick.yaw);
            };
            updateAnimation(tick) {
                let rotation = tick.towerYaw === 0 ? tick.towerYaw - 90 : tick.towerYaw - tick.yaw - 90;
                if (tick.firingTick) {
                    let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                    let punchLengthInMs = 250;
                    let punchPercent = Math.min(msSinceFiring / punchLengthInMs, 1.0);
                    let animationMultiplier = Math.sin(punchPercent * 2 * Math.PI) / Math.PI * -1;
                    this.middle.setPositionX(-20 * animationMultiplier);
                    this.middle.setPositionY(32 + 80 * animationMultiplier);
                }
                this.head.setRotation(rotation);
                this.middle.setRotation(rotation);
                this.middleMask.setRotation(rotation);
            };
        }
        exports.default = MeleeTowerModel;
        /***/ }),
    /* 218 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const ModelEntity_1 = __webpack_require__(202);
        class NeutralCampModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.currentNeutralCampBiome = null;
                this.lastBiomePositionKey = null;
                this.base = new SpriteEntity_1.default(`./asset/pictures/neutral-camp/neutral-camp-base-summer.svg`);
                this.addAttachment(this.base);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateBiomeTexture(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            getBiomeForPosition(tick, networkEntity) {
                let x = networkEntity && networkEntity.getPositionX ? networkEntity.getPositionX() : tick.position && tick.position.x || 0;
                let y = networkEntity && networkEntity.getPositionY ? networkEntity.getPositionY() : tick.position && tick.position.y || 0;
                return window.getZombsBiomeNameForPosition ? window.getZombsBiomeNameForPosition(x, y) : "summer";
            };
            setSpriteTexture(spriteEntity, textureName) {
                if (!spriteEntity || !spriteEntity.sprite) return;
                const originalTextureName = textureName;
                textureName = window.resolveTierTexturePath ? window.resolveTierTexturePath(textureName) : textureName;
                !window.textures && (window.textures = new Map());
                !window.textures.get(textureName) && window.textures.set(textureName, PIXI.Texture.from(textureName));
                spriteEntity.sprite.texture = window.textures.get(textureName);
                spriteEntity.sprite.__zombsOriginalTextureName = originalTextureName;
                spriteEntity.sprite.__zombsTextureName = textureName;
            };
            updateBiomeTexture(tick, networkEntity) {
                let x = networkEntity && networkEntity.getPositionX ? networkEntity.getPositionX() : tick.position && tick.position.x || 0;
                let y = networkEntity && networkEntity.getPositionY ? networkEntity.getPositionY() : tick.position && tick.position.y || 0;
                let positionKey = window.getZombsBiomePositionKey ? window.getZombsBiomePositionKey(x, y, 1024) : `${Math.floor(x / 1024)}:${Math.floor(y / 1024)}`;
                if (positionKey === this.lastBiomePositionKey && this.currentNeutralCampBiome) return;
                this.lastBiomePositionKey = positionKey;
                let biome = window.getZombsBiomeNameForPosition ? window.getZombsBiomeNameForPosition(x, y) : this.getBiomeForPosition(tick, networkEntity);
                if (biome === this.currentNeutralCampBiome) return;
                let extension = (biome === "summer" || biome === "winter") ? "svg" : "png";
                let textureName = `./asset/pictures/neutral-camp/neutral-camp-base-${biome}.${extension}`;
                this.setSpriteTexture(this.base, textureName);
                this.base.setAnchor(biome === "space" ? 0.75625 : 0.5, 0.5);
                this.currentNeutralCampBiome = biome;
            };
        }
        exports.default = NeutralCampModel;
        /***/ }),
    /* 219 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const CharacterModel_1 = __webpack_require__(205);
        const HealthBar_1 = __webpack_require__(200);
        class NeutralModel extends CharacterModel_1.default {
            constructor() {
                super();
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setPosition(0, -5);
                this.healthBar.setScale(0.6);
                this.addAttachment(this.healthBar, 0);
                this.lastBiomePositionKey = null;
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    if (!this.base || (tick.tier && tick.tier !== this.lastTier)) {
                        this.updateModel(tick, networkEntity);
                    }
                    this.updateBiomeTexture(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            getBiomeForPosition(tick, networkEntity) {
                let x = networkEntity && networkEntity.getPositionX ? networkEntity.getPositionX() : tick.position && tick.position.x || 0;
                let y = networkEntity && networkEntity.getPositionY ? networkEntity.getPositionY() : tick.position && tick.position.y || 0;
                return window.getZombsBiomeNameForPosition ? window.getZombsBiomeNameForPosition(x, y) : "summer";
            };
            setSpriteTexture(spriteEntity, textureName) {
                if (!spriteEntity || !spriteEntity.sprite) return;
                const originalTextureName = textureName;
                textureName = window.resolveTierTexturePath ? window.resolveTierTexturePath(textureName) : textureName;
                !window.textures && (window.textures = new Map());
                !window.textures.get(textureName) && window.textures.set(textureName, PIXI.Texture.from(textureName));
                spriteEntity.sprite.texture = window.textures.get(textureName);
                spriteEntity.sprite.__zombsOriginalTextureName = originalTextureName;
                spriteEntity.sprite.__zombsTextureName = textureName;
            };
            updateBiomeTexture(tick, networkEntity) {
                if (!this.base || !this.weapon || tick.model.indexOf('NeutralTier') === -1) return;
                let x = networkEntity && networkEntity.getPositionX ? networkEntity.getPositionX() : tick.position && tick.position.x || 0;
                let y = networkEntity && networkEntity.getPositionY ? networkEntity.getPositionY() : tick.position && tick.position.y || 0;
                let positionKey = window.getZombsBiomePositionKey ? window.getZombsBiomePositionKey(x, y) : `${Math.floor(x / 512)}:${Math.floor(y / 512)}`;
                if (positionKey === this.lastBiomePositionKey && this.currentNeutralBiome) return;
                this.lastBiomePositionKey = positionKey;
                let biome = window.getZombsBiomeNameForPosition ? window.getZombsBiomeNameForPosition(x, y) : this.getBiomeForPosition(tick, networkEntity);
                if (biome === this.currentNeutralBiome) return;
                let tier = biome === "winter" ? (this.neutralTier || 1) : 1;
                this.setSpriteTexture(this.base, `./asset/pictures/neutral/neutral-t${tier}-base-${biome}.svg`);
                this.setSpriteTexture(this.weapon, `./asset/pictures/neutral/neutral-t${tier}-weapon-${biome}.svg`);
                this.currentNeutralBiome = biome;
            };
            updateModel(tick, networkEntity) {
                this.lastTier = tick.tier;
                this.currentNeutralBiome = null;
                this.lastBiomePositionKey = null;
                this.removeAttachment(this.base);
                this.removeAttachment(this.weapon);
                if (tick.model.indexOf('NeutralTier') > -1) {
                    let tier = parseFloat(tick.model.replace('NeutralTier', ''));
                    if (isNaN(tier) || tier === 0) {
                        throw new Error('Invalid neutral tier received: ' + tick.model);
                    }
                    this.neutralTier = tier;
                    this.base = new SpriteEntity_1.default(`./asset/pictures/neutral/neutral-t1-base.svg`);
                    this.weapon = new SpriteEntity_1.default(`./asset/pictures/neutral/neutral-t1-weapon.svg`);
                    this.weapon.setAnchor(0.5, 1);
                    this.weaponUpdateFunc = this.updateSwingingWeapon(300, 100);
                } else {
                    throw new Error('Invalid neutral model received: ' + tick.model);
                }
                this.addAttachment(this.base, 2);
                this.addAttachment(this.weapon, 1);
            };
        }
        exports.default = NeutralModel;
        /***/ }),
    /* 220 */
    /***/ (function(module, exports, __webpack_require__) {
        /***/ }),
    /* 221 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const CharacterModel_1 = __webpack_require__(205);
        const HealthBar_1 = __webpack_require__(200);
        const ExperienceBar_1 = __webpack_require__(208);
        class PetModel extends CharacterModel_1.default {
            constructor() {
                super();
                this.healthBar = new HealthBar_1.default();
                this.experienceBar = new ExperienceBar_1.default();
                this.healthBar.setPosition(0, -10);
                this.healthBar.setScale(0.8);
                this.healthBar.setSize(60, 12);
                this.healthBar.setPivotPoint(18, -64);
                this.experienceBar.setPosition(0, -10);
                this.experienceBar.setScale(0.8);
                this.addAttachment(this.healthBar, 0);
                this.addAttachment(this.experienceBar, 0);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    if (!this.base || (tick.tier && tick.tier !== this.lastTier)) {
                        this.updateModel(tick, networkEntity);
                    }
                }
                super.update.call(this, dt, user);
            };
            updateModel(tick, networkEntity) {
                this.lastTier = tick.tier;
                this.removeAttachment(this.base);
                this.removeAttachment(this.weapon);
                if (tick.model.indexOf('PetCARL') > -1) {
                    this.base = new SpriteEntity_1.default(`./asset/pictures/pet-carl/pet-carl-t${tick.tier}-base.svg`);
                    this.weapon = new SpriteEntity_1.default(`./asset/pictures/pet-carl/pet-carl-t${tick.tier}-weapon.svg`);
                    this.weapon.setAnchor(0.5, 1);
                    this.weaponUpdateFunc = this.updateSwingingWeapon(300, 100);
                } else if (tick.model.indexOf('PetMiner') > -1) {
                    this.base = new SpriteEntity_1.default(`./asset/pictures/pet-miner/pet-miner-t${tick.tier}-base.svg`);
                    this.weapon = new SpriteEntity_1.default(`./asset/pictures/pet-miner/pet-miner-t${tick.tier}-weapon.svg`);
                    this.weapon.setAnchor(0.5, 1);
                    this.weaponUpdateFunc = this.updateSwingingWeapon(300, 100);
                } else {
                    throw new Error('Invalid pet model received: ' + tick.model);
                }
                this.addAttachment(this.base, 2);
                this.addAttachment(this.weapon, 1);
            };
        }
        exports.default = PetModel;
        /***/ }),
    /* 222 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const DrawEntity_1 = __webpack_require__(201);
        const ModelEntity_1 = __webpack_require__(202);
        class PlacementIndicatorModel extends ModelEntity_1.default {
            constructor(args) {
                super();
                this.isOccupied = false;
                this.redSquare = new DrawEntity_1.default();
                this.redSquare.drawRect(-args.width / 2, -args.height / 2, args.width / 2, args.height / 2, { r: 255, g: 0, b: 0 });
                this.redSquare.setAlpha(0.2);
                this.redSquare.setVisible(false);
                this.addAttachment(this.redSquare);
            }
            setIsOccupied(isOccupied) {
                this.isOccupied = isOccupied;
                if (this.isOccupied) {
                    this.redSquare.setVisible(true);
                } else {
                    this.redSquare.setVisible(false);
                }
            };
        }
        exports.default = PlacementIndicatorModel;
        /***/ }),
    /* 223 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const SpriteEntity_1 = __webpack_require__(198);
        const TextEntity_1 = __webpack_require__(209);
        const CharacterModel_1 = __webpack_require__(205);
        const HealthBar_1 = __webpack_require__(200);
        const ShieldBar_1 = __webpack_require__(224);
        const Util_1 = __webpack_require__(214);
        class PlayerModel extends CharacterModel_1.default {
            constructor() {
                super();
                this.base = new SpriteEntity_1.default(`./asset/pictures/player/player-base.svg`);
                this.healthBar = new HealthBar_1.default();
                this.shieldBar = new ShieldBar_1.default();
                this.nameEntity = new TextEntity_1.default('[Unknown]', 'Hammersmith One, sans-serif', 20);
                this.base.setAlpha(0.5);
                this.nameEntity.setAnchor(0.5, 0.5);
                this.nameEntity.setPivotPoint(0, 70);
                this.nameEntity.setColor(220, 220, 220);
                this.nameEntity.setStroke(51, 51, 51, 6);
                this.nameEntity.setFontWeight('bold');
                this.nameEntity.setLetterSpacing(1);
                this.shieldBar.setVisible(false);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.healthBar, 0);
                this.addAttachment(this.shieldBar, 0);
                this.addAttachment(this.nameEntity, 0);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (document.tick1117 == undefined) document.tick1117 = 0;
                if (tick) {
                    this.updateRotationWithLocalData(networkEntity);
                    this.updateNameEntity(tick);
                    if ((tick.weaponName && tick.weaponName !== this.lastWeaponName) || (tick.weaponTier && tick.weaponTier !== this.lastWeaponTier)) {
                        this.updateWeapon(tick, networkEntity);
                    }
                    if (tick.hatName && tick.hatName !== this.lastHatName) {
                        this.updateHat(tick, networkEntity);
                    }
                    if (this.hat) {
                        this.updateHatRotation(tick, networkEntity);
                    }
                    if (tick.zombieShieldMaxHealth && tick.zombieShieldMaxHealth > 0) {
                        this.shieldBar.setVisible(true);
                    } else {
                        this.shieldBar.setVisible(false);
                    }
                    if (tick.timeDead || tick.health <= 0) {
                        this.setVisible(false);
                    } else {
                        this.setVisible(true);
                    }
                }
                super.update.call(this, dt, user);
            };
            updateRotationWithLocalData(entity) {
                if (!entity.isLocal()) return;
                if (!localStorage.disableOldAim) entity.getTargetTick().aimingYaw = entity.getFromTick().aimingYaw = Game_1.default.currentGame.inputPacketCreator.getLastAnyYaw();
            };
            updateNameEntity(tick) {
                if (tick.name !== this.currentName) {
                    this.nameEntity.setString(tick.name);
                    this.currentName = tick.name;
                }
                this.nameEntity.setRotation(-this.getParent().getRotation());
            };
            updateWeapon(tick, entity) {
                this.lastWeaponName = tick.weaponName;
                this.lastWeaponTier = tick.weaponTier;
                this.removeAttachment(this.weapon);
                switch (tick.weaponName) {
                    case 'Pickaxe':
                        let pickaxe;
                        pickaxe = new SpriteEntity_1.default(`./asset/pictures/player/player-pickaxe-t${tick.weaponTier}.svg`);
                        pickaxe.setAnchor(0.5, 1);
                        this.weapon = pickaxe;
                        this.weaponUpdateFunc = this.updateSwingingWeapon(250, 100);
                        break;
                    case 'Spear':
                        let spear = new SpriteEntity_1.default(`./asset/pictures/player/player-spear-t${tick.weaponTier}.svg`);
                        spear.setAnchor(0.5, 1);
                        this.weapon = spear;
                        this.weaponUpdateFunc = this.updateSwingingWeapon(250, 100);
                        break;
                    case 'Bow':
                        let bow = new SpriteEntity_1.default(`./asset/pictures/player/player-bow-t${tick.weaponTier}.svg`);
                        let bowHands = new SpriteEntity_1.default(`./asset/pictures/player/player-bow-t${tick.weaponTier}-hands.svg`);
                        bowHands.setAnchor(0.5, 1);
                        bow.addAttachment(bowHands);
                        bow.setAnchor(0.5, 1);
                        this.weapon = bow;
                        this.weaponUpdateFunc = this.updateBowWeapon(500, 250);
                        break;
                    case 'Bomb':
                        let bomb = new SpriteEntity_1.default(`./asset/pictures/player/player-bomb-t${tick.weaponTier}.svg`);
                        let bombHands = new SpriteEntity_1.default(`./asset/pictures/player/player-bomb-hands.svg`);
                        bombHands.setAnchor(0.5, 1);
                        bomb.addAttachment(bombHands);
                        bomb.setAnchor(0.5, 1);
                        this.weapon = bomb;
                        this.weaponUpdateFunc = this.updateSwingingWeapon(250, 100);
                        break;
                    default:
                        throw new Error('Unknown player weapon: ' + tick.weaponName);
                }
                this.addAttachment(this.weapon, 1);
            };
            updateHat(tick, entity) {
                this.lastHatName = tick.hatName;
                this.removeAttachment(this.hat);
                switch (tick.hatName) {
                    case 'HatHorns':
                        this.hat = new SpriteEntity_1.default(`./asset/pictures/hats/hat-horns-base.png`);
                        break;
                    default:
                        throw new Error('Unknown player hat: ' + tick.hatName);
                }
                this.addAttachment(this.hat, 3);
            };
            updateHatRotation(tick, networkEntity) {
                let aimingYaw = Util_1.default.interpolateYaw((networkEntity.getTargetTick().aimingYaw + document.tick1117 * 180) % 360, (networkEntity.getFromTick().aimingYaw + document.tick1117 * 180) % 360);
                this.hat.setRotation(aimingYaw - tick.interpolatedYaw);
            };
            updateSwingingWeapon(swingLengthInMs = 300, swingAmplitude = 100) {
                return (tick, networkEntity) => {
                    let aimingYaw = Util_1.default.interpolateYaw((networkEntity.getTargetTick().aimingYaw + document.tick1117 * 180) % 360, (networkEntity.getFromTick().aimingYaw + document.tick1117 * 180) % 360);
                    this.weapon.setRotation(aimingYaw - tick.interpolatedYaw);
                    if (tick.firingTick && (tick.firingTick !== this.lastFiringTick || !this.lastFiringAnimationDone)) {
                        this.lastFiringTick = tick.firingTick;
                        this.lastFiringAnimationDone = false;
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                        let swingPercent = Math.min(msSinceFiring / swingLengthInMs, 1.0);
                        let swingDeltaRotation = Math.sin(swingPercent * Math.PI) * swingAmplitude;
                        if (swingPercent === 1) {
                            this.lastFiringAnimationDone = true;
                        }
                        this.weapon.setRotation(aimingYaw - tick.interpolatedYaw - swingDeltaRotation);
                        if (this.hat) {
                            this.hat.setRotation(aimingYaw - tick.interpolatedYaw - swingDeltaRotation * 0.6);
                        }
                    }
                };
            };
            updateBowWeapon(pullLengthInMs = 500, releaseLengthInMs = 250) {
                return (tick, networkEntity) => {
                    let aimingYaw = Util_1.default.interpolateYaw((networkEntity.getTargetTick().aimingYaw + document.tick1117 * 180) % 360, (networkEntity.getFromTick().aimingYaw + document.tick1117 * 180) % 360);
                    this.weapon.setRotation(aimingYaw - tick.interpolatedYaw);
                    if (tick.startChargingTick) {
                        this.lastFiringAnimationDone = false;
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.startChargingTick);
                        let pullPercent = Math.min(msSinceFiring / pullLengthInMs, 1.0);
                        this.weapon.getAttachments()[0].setPositionY(10 * pullPercent);
                    } else if (tick.firingTick && (tick.firingTick !== this.lastFiringTick || !this.lastFiringAnimationDone)) {
                        this.lastFiringTick = tick.firingTick;
                        this.lastFiringAnimationDone = false;
                        let msSinceFiring = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(tick.firingTick);
                        let releasePercent = Math.min(msSinceFiring / releaseLengthInMs, 1.0);
                        if (releasePercent === 1) {
                            this.lastFiringAnimationDone = true;
                        }
                        this.weapon.getAttachments()[0].setPositionY(10 - 10 * releasePercent);
                    }
                };
            };
        }
        exports.default = PlayerModel;
        /***/ }),
    /* 224 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Entity_1 = __webpack_require__(199);
        const DrawEntity_1 = __webpack_require__(201);
        class ShieldBar extends Entity_1.default {
            constructor() {
                super();
                this.barColor = { r: 61, g: 161, b: 217 };
                this.width = 76;
                this.height = 8;
                this.percent = 1;
                this.backgroundNode = new DrawEntity_1.default();
                this.backgroundNode.drawRoundedRect(0, 0, this.width, this.height, 3, { r: 0, g: 0, b: 0 });
                this.backgroundNode.setAlpha(0.3);
                this.barNode = new DrawEntity_1.default();
                this.addAttachment(this.backgroundNode);
                this.addAttachment(this.barNode);
                this.setPivotPoint(this.width / 2, -80);
                this.setMaxHealth(100);
                this.setHealth(100);
            }
            setSize(width, height) {
                let percent = this.percent;
                this.width = width;
                this.height = height;
                this.percent = null;
                this.backgroundNode.clear();
                this.backgroundNode.drawRoundedRect(0, 0, this.width, this.height, 3, { r: 0, g: 0, b: 0 });
                this.setPivotPoint(this.width / 2, -80);
                this.setPercent(percent);
            };
            setHealth(health) {
                this.health = health;
                this.setPercent(this.health / this.maxHealth);
            };
            setMaxHealth(max) {
                this.maxHealth = max;
                this.setPercent(this.health / this.maxHealth);
            };
            setPercent(percent) {
                if (this.percent == percent) return;
                this.percent = percent;
                this.barNode.clear();
                if (this.health === 0) return;
                let fullWidth = this.width - 2;
                let missingLength = fullWidth * this.percent;
                this.barNode.drawRoundedRect(2, 2, missingLength, this.height - 2, 2, this.barColor);
            };
            update(dt, user) {
                let tick = user;
                if (tick) {
                    this.setHealth(tick.zombieShieldHealth);
                    this.setMaxHealth(tick.zombieShieldMaxHealth);
                }
                this.setRotation(-this.getParent().getParent().getRotation());
                super.update.call(this, dt, user);
            };
        }
        exports.default = ShieldBar;
        /***/ }),
    /* 225 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 226 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 227 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 228 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 229 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 230 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 231 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 232 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 233 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const SpriteEntity_1 = __webpack_require__(198);
        const ModelEntity_1 = __webpack_require__(202);
        class ProjectileArrowModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.shotTier = null;
                this.projectileTextureType = null;
                this.updateModel(null);
            }
            reset() {
                super.reset();
                this.removeAttachment(this.base);
                this.base = null;
                this.currentTier = null;
                this.shotTier = null;
                this.projectileTextureType = null;
            }
            update(dt, user) {
                const tier = this.getProjectileTier(user);
                this.updateModel(tier);
                super.update.call(this, dt, user);
            }
            updateModel(tier) {
                const parsedTier = parseInt(tier);
                const textureTier = parsedTier >= 1 && parsedTier <= 8 ? this.getTextureTier(parsedTier) : null;
                const textureType = this.projectileTextureType === 'player' ? 'player' : 'tower';
                const currentTexture = textureTier ? `${textureType}-${textureTier}` : null;
                if (currentTexture === this.currentTier) return;
                this.currentTier = currentTexture;
                this.removeAttachment(this.base);
                this.base = null;
                if (!textureTier) return;
                this.base = new SpriteEntity_1.default(`./asset/pictures/projectiles/arrow-tower-projectile-${textureTier}.svg`);
                this.addAttachment(this.base);
            }
            getTextureTier(tier) {
                if (this.projectileTextureType !== 'player') return `t${tier}`;
                const playerTextureTiers = { 1: 't1', 2: 't3', 3: 't4', 4: 't5', 5: document.useBlueT6Textures ? 't6-blue' : 't6', 6: 't7', 7: 't8' };
                return playerTextureTiers[tier] || `t${tier}`;
            }
            getPlayerProjectileTier(tick, weaponName, maxDistance) {
                if (this.shotTier) return this.shotTier;
                if (!tick.position) return null;
                let closestTier = null;
                let closestDistance = Infinity;
                Game_1.default.currentGame.world.entities.forEach(entity => {
                    const entityTick = entity.getTargetTick && entity.getTargetTick();
                    if (!entityTick || entityTick.model !== 'GamePlayer' || entityTick.weaponName !== weaponName || !entityTick.position || !entityTick.weaponTier) return;
                    const dx = entityTick.position.x - tick.position.x;
                    const dy = entityTick.position.y - tick.position.y;
                    const distance = dx * dx + dy * dy;
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestTier = entityTick.weaponTier;
                    }
                });
                if (closestDistance <= maxDistance * maxDistance) {
                    this.shotTier = closestTier;
                    return this.shotTier;
                }
                return null;
            }
            getProjectileTier(tick) {
                if (!tick) return this.shotTier || null;
                this.projectileTextureType = tick.model === "BowProjectile" ? 'player' : 'tower';
                if (tick.model === "BowProjectile") return this.getPlayerProjectileTier(tick, 'Bow', 700) || 1;
                if (this.shotTier) return this.shotTier;
                if (!tick.position) return null;
                let closestTier = null;
                let closestDistance = Infinity;
                Game_1.default.currentGame.world.entities.forEach(entity => {
                    const entityTick = entity.getTargetTick && entity.getTargetTick();
                    if (!entityTick || entityTick.model !== 'ArrowTower' || !entityTick.position || !entityTick.tier) return;
                    if (!entity.isInViewport || !entity.isInViewport()) return;
                    const dx = entityTick.position.x - tick.position.x;
                    const dy = entityTick.position.y - tick.position.y;
                    const distance = dx * dx + dy * dy;
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestTier = entityTick.tier;
                    }
                });
                if (closestDistance <= 260 * 260) {
                    this.shotTier = closestTier;
                    return this.shotTier;
                }
                return null;
            }
        }
        exports.default = ProjectileArrowModel;
        /***/ }),
    /* 234 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const SpriteEntity_1 = __webpack_require__(198);
        const ModelEntity_1 = __webpack_require__(202);
        class ProjectileBombModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.shotTier = null;
                this.projectileTextureType = null;
                this.updateModel(null);
            }
            reset() {
                super.reset();
                this.removeAttachment(this.base);
                this.base = null;
                this.currentTier = null;
                this.shotTier = null;
                this.projectileTextureType = null;
            }
            update(dt, user) {
                const tier = this.getProjectileTier(user);
                this.updateModel(tier);
                super.update.call(this, dt, user);
            }
            updateModel(tier) {
                const parsedTier = parseInt(tier);
                const textureTier = parsedTier >= 1 && parsedTier <= 8 ? this.getTextureTier(parsedTier) : null;
                const textureType = this.projectileTextureType === 'player' ? 'player' : 'tower';
                const currentTexture = textureTier ? `${textureType}-${textureTier}` : null;
                if (currentTexture === this.currentTier) return;
                this.currentTier = currentTexture;
                this.removeAttachment(this.base);
                this.base = null;
                if (!textureTier) return;
                this.base = new SpriteEntity_1.default(`./asset/pictures/projectiles/bomb-tower-projectile-${textureTier}.svg`);
                this.addAttachment(this.base);
            }
            getTextureTier(tier) {
                if (this.projectileTextureType !== 'player') return `t${tier}`;
                const playerTextureTiers = { 1: 't1', 2: 't3', 3: 't4', 4: 't5', 5: document.useBlueT6Textures ? 't6-blue' : 't6', 6: 't7', 7: 't8' };
                return playerTextureTiers[tier] || `t${tier}`;
            }
            getClosestPlayerProjectileTier(tick, weaponName, maxDistance) {
                if (!tick.position) return null;
                let closestTier = null;
                let closestDistance = Infinity;
                Game_1.default.currentGame.world.entities.forEach(entity => {
                    const entityTick = entity.getTargetTick && entity.getTargetTick();
                    if (!entityTick || entityTick.model !== 'GamePlayer' || entityTick.weaponName !== weaponName || !entityTick.position || !entityTick.weaponTier) return;
                    const dx = entityTick.position.x - tick.position.x;
                    const dy = entityTick.position.y - tick.position.y;
                    const distance = dx * dx + dy * dy;
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestTier = entityTick.weaponTier;
                    }
                });
                if (closestDistance <= maxDistance * maxDistance) {
                    return { tier: closestTier, distance: closestDistance };
                }
                return null;
            }
            getPlayerProjectileTier(tick, weaponName, maxDistance) {
                const closestPlayer = this.getClosestPlayerProjectileTier(tick, weaponName, maxDistance);
                if (!closestPlayer) return null;
                this.shotTier = closestPlayer.tier;
                return this.shotTier;
            }
            getClosestTowerProjectileTier(tick, towerName, maxDistance) {
                if (!tick.position) return null;
                let closestTier = null;
                let closestDistance = Infinity;
                Game_1.default.currentGame.world.entities.forEach(entity => {
                    const entityTick = entity.getTargetTick && entity.getTargetTick();
                    if (!entityTick || entityTick.model !== towerName || !entityTick.position || !entityTick.tier) return;
                    if (!entity.isInViewport || !entity.isInViewport()) return;
                    const dx = entityTick.position.x - tick.position.x;
                    const dy = entityTick.position.y - tick.position.y;
                    const distance = dx * dx + dy * dy;
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestTier = entityTick.tier;
                    }
                });
                if (closestDistance <= maxDistance * maxDistance) {
                    return { tier: closestTier, distance: closestDistance };
                }
                return null;
            }
            getProjectileTier(tick) {
                if (!tick) return this.shotTier || null;
                if (tick.model === "BombProjectile") {
                    if (this.shotTier) return this.shotTier;
                    const closestPlayer = this.getClosestPlayerProjectileTier(tick, 'Bomb', 180);
                    const closestTower = this.getClosestTowerProjectileTier(tick, 'BombTower', 280);
                    if (closestTower && (!closestPlayer || closestTower.distance <= closestPlayer.distance)) {
                        this.projectileTextureType = 'tower';
                        this.shotTier = closestTower.tier;
                        return this.shotTier;
                    }
                    if (closestPlayer) {
                        this.projectileTextureType = 'player';
                        this.shotTier = closestPlayer.tier;
                        return this.shotTier;
                    }
                    this.projectileTextureType = 'tower';
                    return 1;
                }
                this.projectileTextureType = 'tower';
                if (this.shotTier) return this.shotTier;
                if (!tick.position) return null;
                const closestTower = this.getClosestTowerProjectileTier(tick, 'BombTower', 280);
                if (closestTower) {
                    this.shotTier = closestTower.tier;
                    return this.shotTier;
                }
                return null;
            }
        }
        exports.default = ProjectileBombModel;
        /***/ }),
    /* 235 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const SpriteEntity_1 = __webpack_require__(198);
        const ModelEntity_1 = __webpack_require__(202);
        class ProjectileCannonModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.shotTier = null;
                this.updateModel(null);
            }
            reset() {
                super.reset();
                this.removeAttachment(this.base);
                this.base = null;
                this.currentTier = null;
                this.shotTier = null;
            }
            update(dt, user) {
                const tier = this.getProjectileTier(user);
                this.updateModel(tier);
                super.update.call(this, dt, user);
            }
            updateModel(tier) {
                const parsedTier = parseInt(tier);
                const textureTier = parsedTier >= 1 && parsedTier <= 8 ? `t${parsedTier}` : null;
                if (textureTier === this.currentTier) return;
                this.currentTier = textureTier;
                this.removeAttachment(this.base);
                this.base = null;
                if (!textureTier) return;
                this.base = new SpriteEntity_1.default(`./asset/pictures/projectiles/cannon-tower-projectile-${textureTier}.svg`);
                this.addAttachment(this.base);
            }
            getProjectileTier(tick) {
                if (!tick) return this.shotTier || null;
                if (this.shotTier) return this.shotTier;
                if (!tick.position) return null;
                let closestTier = null;
                let closestDistance = Infinity;
                Game_1.default.currentGame.world.entities.forEach(entity => {
                    const entityTick = entity.getTargetTick && entity.getTargetTick();
                    if (!entityTick || entityTick.model !== 'CannonTower' || !entityTick.position || !entityTick.tier) return;
                    if (!entity.isInViewport || !entity.isInViewport()) return;
                    const dx = entityTick.position.x - tick.position.x;
                    const dy = entityTick.position.y - tick.position.y;
                    const distance = dx * dx + dy * dy;
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestTier = entityTick.tier;
                    }
                });
                if (closestDistance <= 280 * 280) {
                    this.shotTier = closestTier;
                    return this.shotTier;
                }
                return null;
            }
        }
        exports.default = ProjectileCannonModel;
        /***/ }),
    /* 236 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const SpriteEntity_1 = __webpack_require__(198);
        const ModelEntity_1 = __webpack_require__(202);
        class ProjectileMageModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.shotTier = null;
                this.updateModel(null);
            }
            reset() {
                super.reset();
                this.removeAttachment(this.base);
                this.base = null;
                this.currentTier = null;
                this.shotTier = null;
            }
            update(dt, user) {
                const tier = this.getProjectileTier(user);
                this.updateModel(tier);
                super.update.call(this, dt, user);
            }
            updateModel(tier) {
                const parsedTier = parseInt(tier);
                const textureTier = parsedTier >= 1 && parsedTier <= 8 ? `t${parsedTier}` : null;
                if (textureTier === this.currentTier) return;
                this.currentTier = textureTier;
                this.removeAttachment(this.base);
                this.base = null;
                if (!textureTier) return;
                this.base = new SpriteEntity_1.default(`./asset/pictures/projectiles/mage-tower-projectile-${textureTier}.svg`);
                this.addAttachment(this.base);
            }
            getProjectileTier(tick) {
                if (!tick) return this.shotTier || null;
                if (this.shotTier) return this.shotTier;
                if (!tick.position) return null;
                let closestTier = null;
                let closestDistance = Infinity;
                Game_1.default.currentGame.world.entities.forEach(entity => {
                    const entityTick = entity.getTargetTick && entity.getTargetTick();
                    if (!entityTick || entityTick.model !== 'MagicTower' || !entityTick.position || !entityTick.tier) return;
                    if (!entity.isInViewport || !entity.isInViewport()) return;
                    const dx = entityTick.position.x - tick.position.x;
                    const dy = entityTick.position.y - tick.position.y;
                    const distance = dx * dx + dy * dy;
                    if (distance < closestDistance) {
                        closestDistance = distance;
                        closestTier = entityTick.tier;
                    }
                });
                if (closestDistance <= 220 * 220) {
                    this.shotTier = closestTier;
                    return this.shotTier;
                }
                return null;
            }
        }
        exports.default = ProjectileMageModel;
        /***/ }),
    /* 237 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const DrawEntity_1 = __webpack_require__(201);
        const ModelEntity_1 = __webpack_require__(202);
        class RangeIndicatorModel extends ModelEntity_1.default {
            constructor(args) {
                super();
                this.isCircular = false;
                this.isCircular = args.isCircular || false;
                this.goldRegion = new DrawEntity_1.default();
                this.goldRegion.setAlpha(0.001);
                if (this.isCircular) {
                   this.goldRegion.drawCircle(0, 0, args.radius / 2, { r: 200, g: 160, b: 0, a: 0.002 }, { r: 255, g: 200, b: 0, a: 0.004 }, 8);
                } else {
                    this.goldRegion.drawRect(-args.width / 2, -args.height / 2, args.width / 2, args.height / 2, { r: 200, g: 160, b: 0, a: 0.002 }, { r: 255, g: 200, b: 0, a: 0.004 }, 8);
                }
                document.showSpawnCircle = document.showSpawnCircle === true;
                document.spawnCircleNodes = document.spawnCircleNodes || [];
                document.spawnCircleNodes.push(this.goldRegion);
                this.goldRegion.setVisible(document.showSpawnCircle);
                this.addAttachment(this.goldRegion);
            }
        }
        exports.default = RangeIndicatorModel;
        /***/ }),
    /* 238 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(1);
        const SpriteEntity_1 = __webpack_require__(198);
        const ModelEntity_1 = __webpack_require__(202);
        class RecoilModel extends ModelEntity_1.default {
            constructor(args) {
                super();
                this.baseTextureName = args.name;
                this.currentTextureName = args.name;
                this.lastBiomePositionKey = null;
                this.base = new SpriteEntity_1.default(args.name);
                this.addAttachment(this.base);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateBiomeTexture(tick, networkEntity);
                    this.updateHit(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            updateBiomeTexture(tick, networkEntity) {
                if (!this.baseTextureName || !networkEntity || this.baseTextureName.indexOf("entities-tree.png") === -1 && this.baseTextureName.indexOf("entities-stone.png") === -1) return;
                let x = networkEntity.getPositionX ? networkEntity.getPositionX() : tick.position && tick.position.x || 0;
                let y = networkEntity.getPositionY ? networkEntity.getPositionY() : tick.position && tick.position.y || 0;
                let positionKey = window.getZombsBiomePositionKey ? window.getZombsBiomePositionKey(x, y) : `${Math.floor(x / 512)}:${Math.floor(y / 512)}`;
                if (positionKey === this.lastBiomePositionKey) return;
                this.lastBiomePositionKey = positionKey;
                let textureName = this.baseTextureName;
                let isTree = this.baseTextureName.indexOf("entities-tree.png") !== -1;
                let prefix = isTree ? "entities-tree" : "entities-stone";
                const biomeAnchors = [
                    { name: "winter", x: 6750, y: 6750 },
                    { name: "savannah", x: 17250, y: 6750 },
                    { name: "space", x: 6750, y: 17250 },
                    { name: "summer", x: 17250, y: 17250 }
                ];
                let biomeWeights = biomeAnchors.map((biome) => {
                    let dx = (x - biome.x) / 7600;
                    let dy = (y - biome.y) / 7600;
                    return { name: biome.name, weight: Math.exp(-(dx * dx + dy * dy) * 1.15) };
                }).sort((a, b) => b.weight - a.weight);
                let selectedBiome = biomeWeights[0].name;
                let blendChance = biomeWeights[1].weight / (biomeWeights[0].weight + biomeWeights[1].weight + 0.0001);
                let hash = Math.abs(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
                if (blendChance > 0.48 && hash < blendChance * 0.38) selectedBiome = biomeWeights[1].name;
                if (selectedBiome === "winter" && isTree) {
                    textureName = "./asset/pictures/world-props/entities-tree-winter-christmas.png";
                } else if (selectedBiome === "winter" || selectedBiome === "space" || selectedBiome === "savannah") {
                    textureName = `./asset/pictures/world-props/${prefix}-${selectedBiome}.png`;
                }
                if (textureName === this.currentTextureName) return;
                let previousPosition = this.base.getPosition();
                this.removeAttachment(this.base);
                this.base = new SpriteEntity_1.default(textureName);
                this.base.setPosition(previousPosition.x, previousPosition.y);
                this.currentTextureName = textureName;
                this.addAttachment(this.base);
            };
            updateHit(tick, networkEntity) {
                let sumX = 0;
                let sumY = 0;
                const animationLengthInMs = 250;
                const moveDistance = 10;
                for (let i = 0; i < tick.hits.length / 2; i++) {
                    const hitTick = tick.hits[i * 2 + 0];
                    const hitYaw = tick.hits[i * 2 + 1];
                    const msSinceHit = Game_1.default.currentGame.world.getReplicator().getMsSinceTick(hitTick);
                    if (msSinceHit >= animationLengthInMs) {
                        continue;
                    }
                    const percent = Math.min(msSinceHit / animationLengthInMs, 1.0);
                    const xDirection = Math.sin(hitYaw * Math.PI / 180.0);
                    const yDirection = Math.cos(hitYaw * Math.PI / 180.0) * -1.0;
                    sumX += (xDirection * moveDistance * Math.sin(percent * Math.PI)) | 0;
                    sumY += (yDirection * moveDistance * Math.sin(percent * Math.PI)) | 0;
                }
                const length = Math.sqrt((sumX * sumX) + (sumY * sumY)) | 0;
                if (length > moveDistance) {
                    sumX /= length;
                    sumY /= length;
                    sumX *= moveDistance;
                    sumY *= moveDistance;
                }
                this.base.setPosition(sumX, sumY);
            };
        }
        exports.default = RecoilModel;
        /***/ }),
    /* 239 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const HealthBar_1 = __webpack_require__(200);
        const ModelEntity_1 = __webpack_require__(202);
        class SlowTrapModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.currentTier = 1;
                this.base = new SpriteEntity_1.default(`./asset/pictures/slow-trap/slow-trap-t1-base.svg`);
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setSize(35, 10);
                this.healthBar.setPivotPoint(35 / 2, -8);
                this.healthBar.setVisible(false);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.healthBar, 3);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick, networkEntity);
                    this.updateHealthBar(tick, networkEntity);
                    this.base.setAlpha(0.5);
                }
                super.update.call(this, dt, user);
            };
            updateModel(tick, networkEntity) {
                if (tick.tier == this.currentTier) return;
                this.currentTier = tick.tier;
                this.removeAttachment(this.base);
                this.base = new SpriteEntity_1.default(`./asset/pictures/slow-trap/slow-trap-t${this.currentTier}-base.svg`);
                this.addAttachment(this.base, 2);
            };
            updateHealthBar(tick, networkEntity) {
                if (tick.health !== tick.maxHealth) {
                    this.healthBar.setVisible(true);
                } else {
                    this.healthBar.setVisible(false);
                }
            };
        }
        exports.default = SlowTrapModel;
        /***/ }),
    /* 240 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const DrawEntity_1 = __webpack_require__(201);
        const ModelEntity_1 = __webpack_require__(202);
        class SpellIndicatorModel extends ModelEntity_1.default {
            constructor(args) {
                super();
                this.rangeRegion = new DrawEntity_1.default();
                this.rangeRegion.setAlpha(0.001);
                this.rangeRegion.drawCircle(0, 0, args.radius, { r: 120, g: 120, b: 120, a: 0.002 }, { r: 255, g: 255, b: 255, a: 0.004 }, 8);
                document.showSpawnCircle = document.showSpawnCircle === true;
                document.spawnCircleNodes = document.spawnCircleNodes || [];
                document.spawnCircleNodes.push(this.rangeRegion);
                this.rangeRegion.setVisible(document.showSpawnCircle);
                this.addAttachment(this.rangeRegion);
            }
        }
        exports.default = SpellIndicatorModel;
        /***/ }),
    /* 241 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const HealthBar_1 = __webpack_require__(200);
        const ModelEntity_1 = __webpack_require__(202);
        class WallModel extends ModelEntity_1.default {
            constructor() {
                super();
                this.currentTier = 1;
                this.base = new SpriteEntity_1.default(`./asset/pictures/wall/wall-t1-base.svg`);
                this.healthBar = new HealthBar_1.default();
                this.healthBar.setSize(35, 10);
                this.healthBar.setPivotPoint(35 / 2, -8);
                this.healthBar.setVisible(false);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.healthBar, 3);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    this.updateModel(tick, networkEntity);
                    this.updateHealthBar(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            updateModel(tick, networkEntity) {
                if (tick.tier == this.currentTier) return;
                this.currentTier = tick.tier;
                this.removeAttachment(this.base);
                this.base = new SpriteEntity_1.default(`./asset/pictures/wall/wall-t${this.currentTier}-base.svg`);
                this.addAttachment(this.base, 2);
            };
            updateHealthBar(tick, networkEntity) {
                if (tick.health !== tick.maxHealth) {
                    this.healthBar.setVisible(true);
                } else {
                    this.healthBar.setVisible(false);
                }
            };
        }
        exports.default = WallModel;
        /***/ }),
    /* 242 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const CharacterModel_1 = __webpack_require__(205);
        const HealthBar_1 = __webpack_require__(200);
        class ZombieBossModel extends CharacterModel_1.default {
            constructor() {
                super();
                this.damageTintScalesWithDamage = true;
                this.damageTintMinDamage = 300;
                this.healthBar = new HealthBar_1.default({ r: 184, g: 70, b: 20 });
                this.healthBar.setPosition(0, -5);
                this.healthBar.setScale(0.85);
                this.healthBar.setAlpha(0.72);
                this.addAttachment(this.healthBar, 0);
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    if (!this.base) {
                        this.updateModel(tick, networkEntity);
                    }
                }
                super.update.call(this, dt, user);
            };
            updateModel(tick, networkEntity) {
                let tier = parseFloat(tick.model.replace('ZombieBossTier', ''));
                if (isNaN(tier) || tier === 0) throw new Error('Invalid boss zombie tier received: ' + tick.model);
                this.base = new SpriteEntity_1.default(`./asset/pictures/zombie-boss/zombie-boss-t1-base.svg`);
                this.weapon = new SpriteEntity_1.default(`./asset/pictures/zombie-boss/zombie-boss-t1-weapon.svg`);
                this.weapon.setAnchor(0.5, 1);
                this.weaponUpdateFunc = this.updateSwingingWeapon(500, 60);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.weapon, 1);
            };
        }
        exports.default = ZombieBossModel;
        /***/ }),
    /* 243 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const SpriteEntity_1 = __webpack_require__(198);
        const CharacterModel_1 = __webpack_require__(205);
        const HealthBar_1 = __webpack_require__(200);
        class ZombieModel extends CharacterModel_1.default {
            constructor() {
                super();
                this.damageTintScalesWithDamage = true;
                this.damageTintMinDamage = 300;
                this.healthBar = new HealthBar_1.default({ r: 184, g: 70, b: 20 });
                this.healthBar.setPosition(0, -5);
                this.healthBar.setScale(0.5);
                this.healthBar.setAlpha(0.52);
                this.addAttachment(this.healthBar, 0);
                this.healthBarBaseOffset = -5;
                this.healthBarTurnOffset = 7;
                this.healthBarDownOffset = 0;
                this.updateSwingingWeaponArr = [[300,100],undefined,[300,100],[300,100],[400,90],[400,90],[400,90],[500,80],[500,80],[500,80],[500,80]];
                this.modelArr = ["Green", "Blue", "Red", "Yellow", "Purple", "Orange"];
                this.lastBiomePositionKey = null;
            }
            update(dt, user) {
                let tick = user;
                let networkEntity = this.getParent();
                if (tick) {
                    !this.base && this.updateModel(tick, networkEntity);
                    this.updateBiomeTexture(tick, networkEntity);
                    this.updateHealthBarPosition(tick, networkEntity);
                }
                super.update.call(this, dt, user);
            };
            getBiomeForPosition(tick, networkEntity) {
                let x = networkEntity && networkEntity.getPositionX ? networkEntity.getPositionX() : tick.position && tick.position.x || 0;
                let y = networkEntity && networkEntity.getPositionY ? networkEntity.getPositionY() : tick.position && tick.position.y || 0;
                return window.getZombsBiomeNameForPosition ? window.getZombsBiomeNameForPosition(x, y) : "summer";
            };
            updateHealthBarPosition(tick, networkEntity) {
                let yaw = networkEntity && networkEntity.getRotation ? networkEntity.getRotation() : tick && (tick.interpolatedYaw || tick.yaw) || 0;
                let radians = yaw * Math.PI / 180;
                let sidewaysAmount = Math.abs(Math.sin(radians));
                let downAmount = Math.max(0, -Math.cos(radians));
                let offset = this.healthBarBaseOffset + sidewaysAmount * this.healthBarTurnOffset + downAmount * this.healthBarDownOffset;
                this.healthBar.setPosition(offset * Math.sin(radians), offset * Math.cos(radians));
            };
            setSpriteTexture(spriteEntity, textureName) {
                if (!spriteEntity || !spriteEntity.sprite) return;
                const originalTextureName = textureName;
                textureName = window.resolveTierTexturePath ? window.resolveTierTexturePath(textureName) : textureName;
                !window.textures && (window.textures = new Map());
                !window.textures.get(textureName) && window.textures.set(textureName, PIXI.Texture.from(textureName));
                spriteEntity.sprite.texture = window.textures.get(textureName);
                spriteEntity.sprite.__zombsOriginalTextureName = originalTextureName;
                spriteEntity.sprite.__zombsTextureName = textureName;
            };
            updateBiomeTexture(tick, networkEntity) {
                if (document.disableZombieSprite || !this.zombieColor || !this.base || !this.weapon) return;
                let x = networkEntity && networkEntity.getPositionX ? networkEntity.getPositionX() : tick.position && tick.position.x || 0;
                let y = networkEntity && networkEntity.getPositionY ? networkEntity.getPositionY() : tick.position && tick.position.y || 0;
                let positionKey = window.getZombsBiomePositionKey ? window.getZombsBiomePositionKey(x, y) : `${Math.floor(x / 512)}:${Math.floor(y / 512)}`;
                if (positionKey === this.lastBiomePositionKey && this.currentZombieBiome) return;
                this.lastBiomePositionKey = positionKey;
                let biome = window.getZombsBiomeNameForPosition ? window.getZombsBiomeNameForPosition(x, y) : this.getBiomeForPosition(tick, networkEntity);
                if (biome === this.currentZombieBiome) return;
                let baseTexture = `./asset/pictures/zombie-${this.zombieColor}/zombie-${this.zombieColor}-t${this.zombieTier}-base-${biome}.svg`;
                let weaponTexture = `./asset/pictures/zombie-${this.zombieColor}/zombie-${this.zombieColor}-t${this.zombieTier}-weapon-${biome}.svg`;
                this.setSpriteTexture(this.base, baseTexture);
                this.setSpriteTexture(this.weapon, weaponTexture);
                this.currentZombieBiome = biome;
            };
            updateModel(tick, networkEntity) {
                let color = this.modelArr.find(e => tick.model.indexOf('Zombie' + e) > -1);
                let tier = parseFloat(tick.model.replace('Zombie' + color + 'Tier', ''));
                let index = this.updateSwingingWeaponArr[tier];
                if (isNaN(tier) || tier === 0) throw new Error(`Invalid ${color.toLowerCase()} zombie tier received: ` + tick.model);
                this.zombieColor = color.toLowerCase();
                this.zombieTier = tier;
                this.currentZombieBiome = null;
                this.lastBiomePositionKey = null;
                this.healthBarBaseOffset = tier >= 10 ? 5 : tier >= 8 ? -2 : -10;
                this.healthBarTurnOffset = tier >= 10 ? 14 : tier >= 8 ? 9 : 4;
                this.healthBarDownOffset = tier >= 10 ? 16 : tier >= 8 ? 11 : 8;
                this.updateHealthBarPosition(tick, networkEntity);
                if (!document.disableZombieSprite) {
                    this.base = new SpriteEntity_1.default(`./asset/pictures/zombie-${color.toLowerCase()}/zombie-${color.toLowerCase()}-t${tier}-base.svg`);
                    this.weapon = new SpriteEntity_1.default(`./asset/pictures/zombie-${color.toLowerCase()}/zombie-${color.toLowerCase()}-t${tier}-weapon.svg`);
                } else {
                    this.base = new SpriteEntity_1.default(`./asset`);
                    this.weapon = new SpriteEntity_1.default(`./asset`);
                }
                this.weapon.setAnchor(0.5, 1);
                this.weaponUpdateFunc = tier === 1 ? this.updatePunchingWeapon() : this.updateSwingingWeapon(index[0], index[1]);
                this.addAttachment(this.base, 2);
                this.addAttachment(this.weapon, 1);
            };
        }
        exports.default = ZombieModel;
        /***/ }),
    /* 244 */
    /***/ (function(module, exports, __webpack_require__) {
        /***/ }),
    /* 245 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        const RendererLayer_1 = __webpack_require__(246);
        const Entity_1 = __webpack_require__(199);
        const NetworkEntity_1 = __webpack_require__(247);
        const GroundEntity_1 = __webpack_require__(249);
        const TextEntity_1 = __webpack_require__(209);
        const events = __webpack_require__(250);
        const Debug = __webpack_require__(192);
        const debug = Debug('Engine:Renderer/Renderer');
        class Renderer extends events.EventEmitter {
            constructor(forceCanvas = false) {
                super();
                this.scale = 1;
                this.baseScale = 1;
                this.targetScale = 1;
                this.zoomScale = 1;
                this.zoomStartScale = 1;
                this.zoomTargetScale = 1;
                this.zoomElapsed = 0;
                this.zoomDuration = 300;
                this.forceCanvas = false;
                this.tickCallbacks = [];
                this.lastMsElapsed = 0;
                this.firstPerformance = null;
                this.followingObject = null;
                this.viewport = { x: -500, y: -400, width: 1000, height: 800 };
                this.viewportPadding = 900;
                this.longFrames = 0;
                this.forceCanvas = forceCanvas;
                this.renderer = PIXI.autoDetectRenderer({backgroundColor: 0});
                this.renderer.roundPixels = true;
                this.renderer.events.destroy();
                this.renderer.view.oncontextmenu = (e) => e.preventDefault();
                document.addEventListener('wheel', this.onWheel.bind(this), { passive: false });
                document.body.appendChild(this.renderer.view);
                window.addEventListener('resize', this.onWindowResize.bind(this));
                this.ticker = new PIXI.Ticker();
                this.ticker.add(this.update.bind(this));
                this.scene = new Entity_1.default();
                this.entities = new RendererLayer_1.default();
                this.ui = new RendererLayer_1.default();
                this.ground = new RendererLayer_1.default();
                this.entities.addAttachment(this.ground);
                this.scenery = new RendererLayer_1.default();
                this.entities.addAttachment(this.scenery);
                this.npcs = new RendererLayer_1.default();
                this.entities.addAttachment(this.npcs);
                this.projectiles = new RendererLayer_1.default();
                this.entities.addAttachment(this.projectiles);
                this.players = new RendererLayer_1.default();
                this.entities.addAttachment(this.players);
                this.scene.addAttachment(this.entities);
                this.scene.addAttachment(this.ui);
                this.scene.setVisible(false);
                this.onWindowResize();
            }
            add(object, entityClass) {
                if (object instanceof NetworkEntity_1.default) {
                    const modelName = object.currentModel && object.currentModel.modelName;
                    const modelLayer = modelName === 'ArrowTowerModel' ? 2 : modelName === 'HarvesterModel' ? 1 : 0;
                    switch (entityClass) {
                        case 'Prop':
                            this.scenery.addAttachment(object, modelLayer);
                            break;
                        case 'Projectile':
                            this.projectiles.addAttachment(object, modelLayer);
                            break;
                        case 'Player':
                            this.players.addAttachment(object, modelLayer);
                            break;
                        case 'Npc':
                            this.npcs.addAttachment(object, modelLayer);
                            break;
                        default:
                            this.npcs.addAttachment(object, modelLayer);
                    }
                } else if (object instanceof GroundEntity_1.default) {
                    this.ground.addAttachment(object);
                } else if (object instanceof TextEntity_1.default) {
                    this.ui.addAttachment(object);
                } else {
                    throw new Error('Unhandled object: ' + JSON.stringify(object));
                }
            };
            getLongFrames() {
                return this.longFrames;
            };
            remove(object) {
                if (object instanceof NetworkEntity_1.default) {
                    switch (object.entityClass) {
                        case 'Prop':
                            this.scenery.removeAttachment(object);
                            break;
                        case 'Projectile':
                            this.projectiles.removeAttachment(object);
                            break;
                        case 'Player':
                            this.players.removeAttachment(object);
                            break;
                        case 'Npc':
                            this.npcs.removeAttachment(object);
                            break;
                        default:
                            this.npcs.removeAttachment(object);
                    }
                } else if (object instanceof GroundEntity_1.default) {
                    this.ground.removeAttachment(object);
                } else if (object instanceof TextEntity_1.default) {
                    this.ui.removeAttachment(object);
                }
            };
            follow(object) {
                this.scene.setVisible(true);
                this.followingObject = object;
            };
            stopFollowing() {
                this.followingObject = null;
            };
            start(firstTime) {
                this.ticker.start();
            };
            stop() {
                this.ticker.stop();
            };
            screenToWorld(x, y) {
                const offsetX = -this.entities.getPositionX();
                const offsetY = -this.entities.getPositionY();
                return {
                    x: (offsetX * (1 / this.scale)) + (x * (1 / this.scale) * window.devicePixelRatio),
                    y: (offsetY * (1 / this.scale)) + (y * (1 / this.scale) * window.devicePixelRatio)
                };
            };
            worldToScreen(x, y) {
                const offsetX = -this.entities.getPositionX();
                const offsetY = -this.entities.getPositionY();
                return {
                    x: (x - (offsetX * (1 / this.scale))) * this.scale * (1 / window.devicePixelRatio),
                    y: (y - (offsetY * (1 / this.scale))) * this.scale * (1 / window.devicePixelRatio)
                };
            };
            worldToUi(x, y) {
                const offsetX = -this.entities.getPositionX();
                const offsetY = -this.entities.getPositionY();
                return {
                    x: x - (offsetX * (1 / this.scale)),
                    y: y - (offsetY * (1 / this.scale))
                };
            };
            lookAtPosition(x, y) {
                const halfX = (window.innerWidth * window.devicePixelRatio) / 2;
                const halfY = (window.innerHeight * window.devicePixelRatio) / 2;
                const oldPositionX = this.entities.getPositionX();
                const oldPositionY = this.entities.getPositionY();
                const newPosition = { x: -x * this.scale + halfX, y: -y * this.scale + halfY };
                this.entities.setPosition(newPosition.x, newPosition.y);
                this.viewport.x = x - halfX / this.scale - this.viewportPadding;
                this.viewport.y = y - halfY / this.scale - this.viewportPadding;
                if (oldPositionX !== newPosition.x || oldPositionY !== newPosition.y) {
                    this.emit('cameraUpdate', newPosition);
                }
            };
            addTickCallback(callback) {
                this.tickCallbacks.push(callback);
            };
            getWidth() {
                return this.renderer.width / window.devicePixelRatio;
            };
            getHeight() {
                return this.renderer.height / window.devicePixelRatio;
            };
            getScale() {
                return this.scale;
            };
            getCurrentViewport() {
                return this.viewport;
            };
            getInternalRenderer() {
                return this.renderer;
            };
            update(delta) {
                if (this.firstPerformance === null) {
                    this.firstPerformance = performance.now();
                    return;
                }
                const now = performance.now();
                const totalMs = now - this.firstPerformance;
                delta = totalMs - this.lastMsElapsed;
                this.lastMsElapsed = totalMs;
                Game_1.default.currentGame.debug.begin();
                try {
                    for (let i = 0; i < this.tickCallbacks.length; i++) {
                        this.tickCallbacks[i](delta);
                    }
                } catch (e) {}
                this.updateSmoothZoom(delta);
                if (this.followingObject) this.lookAtPosition(this.followingObject.getPositionX(), this.followingObject.getPositionY());
                try {
                    this.scene.update(delta, null);
                } catch (e) {}
                this.renderer.render(this.scene.getNode());
                let timerTotal = Math.round((performance.now() - now) * 100) / 100;
                if (timerTotal >= 10) {
                    this.longFrames++;
                }
                Game_1.default.currentGame.debug.end();
            };
            onWindowResize() {
                const canvasWidth = window.innerWidth * window.devicePixelRatio;
                const canvasHeight = window.innerHeight * window.devicePixelRatio;
                const ratio = Math.max(canvasWidth / 3840, canvasHeight / 2160);
                this.baseScale = ratio;
                this.targetScale = ratio * this.zoomScale;
                this.scale = this.targetScale;
                this.zoomStartScale = this.scale;
                this.zoomTargetScale = this.scale;
                this.zoomElapsed = this.zoomDuration;
                this.entities.setScale(this.scale);
                this.ui.setScale(ratio);
                this.renderer.resize(canvasWidth, canvasHeight);
                this.viewport.width = this.renderer.width / this.scale + 2 * this.viewportPadding;
                this.viewport.height = this.renderer.height / this.scale + 2 * this.viewportPadding;
            };
            onWheel(event) {
                if (event.target && event.target.closest && event.target.closest('.hud-menu, .hud-intro, .hud-respawn')) return;
                event.preventDefault();
                const modeMultiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
                const delta = Math.max(-100, Math.min(100, event.deltaY * modeMultiplier));
                const zoomFactor = Math.exp(-delta * 0.00032);
                this.zoomScale = Math.max(0.05, Math.min(20, this.zoomScale * zoomFactor));
                this.targetScale = this.baseScale * this.zoomScale;
                this.zoomStartScale = this.scale;
                this.zoomTargetScale = this.targetScale;
                this.zoomElapsed = 0;
            };
            updateSmoothZoom(delta) {
                if (Math.abs(this.scale - this.zoomTargetScale) < 0.0005) return;
                this.zoomElapsed = Math.min(this.zoomElapsed + delta, this.zoomDuration);
                const progress = this.zoomElapsed / this.zoomDuration;
                const eased = 1 - Math.pow(1 - progress, 3);
                this.scale = this.zoomStartScale + (this.zoomTargetScale - this.zoomStartScale) * eased;
                this.entities.setScale(this.scale);
                this.viewport.width = this.renderer.width / this.scale + 2 * this.viewportPadding;
                this.viewport.height = this.renderer.height / this.scale + 2 * this.viewportPadding;
            };
        }
        exports.default = Renderer;
        /***/ }),
    /* 246 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Entity_1 = __webpack_require__(199);
        class RendererLayer extends Entity_1.default {
            constructor() {
                super();
                this.setNode(new PIXI.Container());
            }
        }
        exports.default = RendererLayer;
        /***/ }),
    /* 247 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        const Entity_1 = __webpack_require__(199);
        const Util_1 = __webpack_require__(214);
        const entities = __webpack_require__(248);
        class NetworkEntity extends Entity_1.default {
            constructor(tick) {
                super();
                this.uid = 0;
                this.uid = tick.uid;
                this.setShouldCull(false);
                this.setVisible(true);
                this.setTargetTick(tick);
            }
            reset() {
                this.uid = 0;
                this.currentModel = null;
                this.entityClass = null;
                this.fromTick = null;
                this.targetTick = null;
                this.isDeathFading = false;
                this.setVisible(true);
            };
            isLocal() {
                let local = Game_1.default.currentGame.world.getLocalPlayer();
                if (!local || !local.getEntity()) return false;
                return this.uid == local.getEntity().uid;
            };
            getTargetTick() {
                return this.targetTick;
            };
            getFromTick() {
                return this.fromTick;
            };
            setTargetTick(tick) {
                if (!this.targetTick) {
                    this.entityClass = tick.entityClass;
                    this.targetTick = {...tick};
                    this.fromTick = {};
                }
                this.fromTick = {...this.targetTick};
                this.addMissingTickFields(this.targetTick, tick);
                if (tick.scale !== undefined) {
                    this.setScale(tick.scale);
                }
                if (this.fromTick.model !== this.targetTick.model) {
                    this.refreshModel(this.targetTick.model);
                }
                this.entityClass = this.targetTick.entityClass;
            };
            tick(msInThisTick, msPerTick) {
                if (!this.fromTick) return;
                const tickPercent = msInThisTick / msPerTick;
                if (!this.isVisible) this.setVisible(true);
                this.node.position.x = Util_1.default.lerp(this.fromTick.position.x, this.targetTick.position.x, tickPercent);
                this.node.position.y = Util_1.default.lerp(this.fromTick.position.y, this.targetTick.position.y, tickPercent);
                this.setRotation(Util_1.default.interpolateYaw(this.targetTick.yaw, this.fromTick.yaw));
            };
            update(dt) {
                if (this.fromTick) {
                    this.fromTick.interpolatedYaw = this.getRotation();
                }
                if (this.currentModel) {
                    this.currentModel.update(dt, this.fromTick);
                }
                if (this.isDeathFading) {
                    this.node.visible = true;
                    return;
                }
                this.node.visible = this.isVisible && this.isInViewport();
            };
            refreshModel(networkModelName) {
                let entity = entities[networkModelName];
                if (!entity) throw new Error('Attempted to create unknown model: ' + networkModelName);
                let modelName = entity.model;
                if (Game_1.default.currentGame.getModelEntityPooling(modelName)) {
                    this.currentModel = Game_1.default.currentGame.world.getModelFromPool(modelName);
                }
                if (!this.currentModel) {
                    let args = {};
                    if ('args' in entity) {
                        args = entity.args;
                    }
                    args['modelName'] = networkModelName;
                    this.currentModel = Game_1.default.currentGame.assetManager.loadModel(modelName, args);
                    this.currentModel.modelName = modelName;
                }
                this.currentModel.setParent(this);
                this.setNode(this.currentModel.getNode());
                // messy
                // todo: optimize
            };
            addMissingTickFields(tick, lastTick) {
                let obj = Object.keys(lastTick);
                for (let i = 0; i < obj.length; i++) {
                    let e = obj[i];
                    tick[e] = lastTick[e];
                }
            };
        }
        exports.default = NetworkEntity;
        /***/ }),
    /* 248 */
    /***/ ((module, exports) => {

        module.exports = {
            "GamePlayer": {
                "model": "PlayerModel"
            },
            "Stone": {
                "model": "RecoilModel",
                "gridSize": {
                    "width": 3,
                    "height": 3
                },
                "args": {
                    "name": `./asset/pictures/world-props/entities-stone.png`
                }
            },
            "Tree": {
                "model": "RecoilModel",
                "gridSize": {
                    "width": 4,
                    "height": 4
                },
                "args": {
                    "name": `./asset/pictures/world-props/entities-tree.png`
                }
            },
            "Wall": {
                "model": "WallModel"
            },
            "Door": {
                "model": "DoorModel"
            },
            "SlowTrap": {
                "model": "SlowTrapModel"
            },
            "ArrowTower": {
                "model": "ArrowTowerModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "CannonTower": {
                "model": "CannonTowerModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "MeleeTower": {
                "model": "MeleeTowerModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "BombTower": {
                "model": "BombTowerModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "MagicTower": {
                "model": "MageTowerModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "GoldMine": {
                "model": "GoldMineModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "Harvester": {
                "model": "HarvesterModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "GoldStash": {
                "model": "GoldStashModel",
                "gridSize": {
                    "width": 2,
                    "height": 2
                }
            },
            "ArrowProjectile": {
                "model": "ProjectileArrowModel"
            },
            "CannonProjectile": {
                "model": "ProjectileCannonModel"
            },
            "BowProjectile": {
                "model": "ProjectileArrowModel"
            },
            "BombProjectile": {
                "model": "ProjectileBombModel"
            },
            "FireballProjectile": {
                "model": "ProjectileMageModel"
            },
            "HealTowersSpell": {
                "model": "HealTowersSpellModel"
            },
            "PetCARL": {
                "model": "PetModel"
            },
            "PetMiner": {
                "model": "PetModel"
            },
            "ZombieGreenTier1": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier2": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier3": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier4": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier5": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier6": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier7": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier8": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier9": {
                "model": "ZombieModel"
            },
            "ZombieGreenTier10": {
                "model": "ZombieModel"
            },
            "ZombieRangedGreenTier1": {
                "model": "ZombieRangedModel"
            },
            "ZombieBlueTier1": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier2": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier3": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier4": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier5": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier6": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier7": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier8": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier9": {
                "model": "ZombieModel"
            },
            "ZombieBlueTier10": {
                "model": "ZombieModel"
            },
            "ZombieRedTier1": {
                "model": "ZombieModel"
            },
            "ZombieRedTier2": {
                "model": "ZombieModel"
            },
            "ZombieRedTier3": {
                "model": "ZombieModel"
            },
            "ZombieRedTier4": {
                "model": "ZombieModel"
            },
            "ZombieRedTier5": {
                "model": "ZombieModel"
            },
            "ZombieRedTier6": {
                "model": "ZombieModel"
            },
            "ZombieRedTier7": {
                "model": "ZombieModel"
            },
            "ZombieRedTier8": {
                "model": "ZombieModel"
            },
            "ZombieRedTier9": {
                "model": "ZombieModel"
            },
            "ZombieRedTier10": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier1": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier2": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier3": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier4": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier5": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier6": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier7": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier8": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier9": {
                "model": "ZombieModel"
            },
            "ZombieYellowTier10": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier1": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier2": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier3": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier4": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier5": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier6": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier7": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier8": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier9": {
                "model": "ZombieModel"
            },
            "ZombiePurpleTier10": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier1": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier2": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier3": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier4": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier5": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier6": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier7": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier8": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier9": {
                "model": "ZombieModel"
            },
            "ZombieOrangeTier10": {
                "model": "ZombieModel"
            },
            "ZombieBossTier1": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier2": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier3": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier4": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier5": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier6": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier7": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier8": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier9": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier10": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier11": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier12": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier13": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier14": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier15": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier16": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier17": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier18": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier19": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier20": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier21": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier22": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier23": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier24": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier25": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier26": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier27": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier28": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier29": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier30": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier31": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier32": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier33": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier34": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier35": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier36": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier37": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier38": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier39": {
                "model": "ZombieBossModel"
            },
            "ZombieBossTier40": {
                "model": "ZombieBossModel"
            },
            "NeutralCamp": {
                "model": "NeutralCampModel"
            },
            "NeutralTier1": {
                "model": "NeutralModel"
            },
            "PathNode": {
                "model": "PathNodeModel"
            }
        };

        /***/ }),
    /* 249 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Entity_1 = __webpack_require__(199);
        class GroundEntity extends Entity_1.default {
            constructor() {
                super();
            }
        }
        exports.default = GroundEntity;
        /***/ }),
    /* 250 */
    /***/ (function(module, exports) {

        function EventEmitter() {
            this._events = this._events || {};
            this._maxListeners = this._maxListeners || undefined;
        }
        module.exports = EventEmitter;

        // Backwards-compat with node 0.10.x
        EventEmitter.EventEmitter = EventEmitter;

        EventEmitter.prototype._events = undefined;
        EventEmitter.prototype._maxListeners = undefined;

        // By default EventEmitters will print a warning if more than 10 listeners are
        // added to it. This is a useful default which helps finding memory leaks.
        EventEmitter.defaultMaxListeners = 10;

        // Obviously not all Emitters should be limited to 10. This function allows
        // that to be increased. Set to zero for unlimited.
        EventEmitter.prototype.setMaxListeners = function(n) {
            if (!isNumber(n) || n < 0 || isNaN(n))
                throw TypeError('n must be a positive number');
            this._maxListeners = n;
            return this;
        };

        EventEmitter.prototype.emit = function(type) {
            var er, handler, len, args, i, listeners;

            if (!this._events)
                this._events = {};

            // If there is no 'error' event listener then throw.
            if (type === 'error') {
                if (!this._events.error ||
                    (isObject(this._events.error) && !this._events.error.length)) {
                    er = arguments[1];
                    if (er instanceof Error) {
                        throw er; // Unhandled 'error' event
                    } else {
                        // At least give some kind of context to the user
                        var err = new Error('Uncaught, unspecified "error" event. (' + er + ')');
                        err.context = er;
                        throw err;
                    }
                }
            }

            handler = this._events[type];

            if (isUndefined(handler))
                return false;

            if (isFunction(handler)) {
                switch (arguments.length) {
                        // fast cases
                    case 1:
                        handler.call(this);
                        break;
                    case 2:
                        handler.call(this, arguments[1]);
                        break;
                    case 3:
                        handler.call(this, arguments[1], arguments[2]);
                        break;
                        // slower
                    default:
                        args = Array.prototype.slice.call(arguments, 1);
                        handler.apply(this, args);
                }
            } else if (isObject(handler)) {
                args = Array.prototype.slice.call(arguments, 1);
                listeners = handler.slice();
                len = listeners.length;
                for (i = 0; i < len; i++)
                    listeners[i].apply(this, args);
            }

            return true;
        };

        EventEmitter.prototype.addListener = function(type, listener) {
            var m;

            if (!isFunction(listener))
                throw TypeError('listener must be a function');

            if (!this._events)
                this._events = {};

            // To avoid recursion in the case that type === "newListener"! Before
            // adding it to the listeners, first emit "newListener".
            if (this._events.newListener)
                this.emit('newListener', type,
                          isFunction(listener.listener) ?
                          listener.listener : listener);

            if (!this._events[type])
                // Optimize the case of one listener. Don't need the extra array object.
                this._events[type] = listener;
            else if (isObject(this._events[type]))
                // If we've already got an array, just append.
                this._events[type].push(listener);
            else
                // Adding the second element, need to change to array.
                this._events[type] = [this._events[type], listener];

            // Check for listener leak
            if (isObject(this._events[type]) && !this._events[type].warned) {
                if (!isUndefined(this._maxListeners)) {
                    m = this._maxListeners;
                } else {
                    m = EventEmitter.defaultMaxListeners;
                }

                if (m && m > 0 && this._events[type].length > m) {
                    this._events[type].warned = true;
                    console.error('(node) warning: possible EventEmitter memory ' +
                                  'leak detected. %d listeners added. ' +
                                  'Use emitter.setMaxListeners() to increase limit.',
                                  this._events[type].length);
                    if (typeof console.trace === 'function') {
                        // not supported in IE 10
                        console.trace();
                    }
                }
            }

            return this;
        };

        EventEmitter.prototype.on = EventEmitter.prototype.addListener;

        EventEmitter.prototype.once = function(type, listener) {
            if (!isFunction(listener))
                throw TypeError('listener must be a function');

            var fired = false;

            function g() {
                this.removeListener(type, g);

                if (!fired) {
                    fired = true;
                    listener.apply(this, arguments);
                }
            }

            g.listener = listener;
            this.on(type, g);

            return this;
        };

        // emits a 'removeListener' event iff the listener was removed
        EventEmitter.prototype.removeListener = function(type, listener) {
            var list, position, length, i;

            if (!isFunction(listener))
                throw TypeError('listener must be a function');

            if (!this._events || !this._events[type])
                return this;

            list = this._events[type];
            length = list.length;
            position = -1;

            if (list === listener ||
                (isFunction(list.listener) && list.listener === listener)) {
                delete this._events[type];
                if (this._events.removeListener)
                    this.emit('removeListener', type, listener);

            } else if (isObject(list)) {
                for (i = length; i-- > 0;) {
                    if (list[i] === listener ||
                        (list[i].listener && list[i].listener === listener)) {
                        position = i;
                        break;
                    }
                }

                if (position < 0)
                    return this;

                if (list.length === 1) {
                    list.length = 0;
                    delete this._events[type];
                } else {
                    list.splice(position, 1);
                }

                if (this._events.removeListener)
                    this.emit('removeListener', type, listener);
            }

            return this;
        };

        EventEmitter.prototype.removeAllListeners = function(type) {
            var key, listeners;

            if (!this._events)
                return this;

            // not listening for removeListener, no need to emit
            if (!this._events.removeListener) {
                if (arguments.length === 0)
                    this._events = {};
                else if (this._events[type])
                    delete this._events[type];
                return this;
            }

            // emit removeListener for all listeners on all events
            if (arguments.length === 0) {
                for (key in this._events) {
                    if (key === 'removeListener') continue;
                    this.removeAllListeners(key);
                }
                this.removeAllListeners('removeListener');
                this._events = {};
                return this;
            }

            listeners = this._events[type];

            if (isFunction(listeners)) {
                this.removeListener(type, listeners);
            } else if (listeners) {
                // LIFO order
                while (listeners.length)
                    this.removeListener(type, listeners[listeners.length - 1]);
            }
            delete this._events[type];

            return this;
        };

        EventEmitter.prototype.listeners = function(type) {
            var ret;
            if (!this._events || !this._events[type])
                ret = [];
            else if (isFunction(this._events[type]))
                ret = [this._events[type]];
            else
                ret = this._events[type].slice();
            return ret;
        };

        EventEmitter.prototype.listenerCount = function(type) {
            if (this._events) {
                var evlistener = this._events[type];

                if (isFunction(evlistener))
                    return 1;
                else if (evlistener)
                    return evlistener.length;
            }
            return 0;
        };

        EventEmitter.listenerCount = function(emitter, type) {
            return emitter.listenerCount(type);
        };

        function isFunction(arg) {
            return typeof arg === 'function';
        }

        function isNumber(arg) {
            return typeof arg === 'number';
        }

        function isObject(arg) {
            return typeof arg === 'object' && arg !== null;
        }

        function isUndefined(arg) {
            return arg === void 0;
        }


        /***/ }),
    /* 251 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        const events = __webpack_require__(250);
        class InputManager extends events.EventEmitter {
            constructor() {
                super();
                this.mousePosition = { x: 0, y: 0 };
                this.mouseDown = false;
                this.mouseRightDown = false;
                this.keysDown = {};
                this.enabled = false;
                document.onkeydown = this.onKeyPress.bind(this);
                document.onkeyup = this.onKeyRelease.bind(this);
                document.onmousedown = this.onMouseDown.bind(this);
                document.onmouseup = this.onMouseUp.bind(this);
                document.onmousemove = this.onMouseMoved.bind(this);
                Game_1.default.currentGame.network.addEnterWorldHandler((data) => {
                    if (!data.allowed) return;
                    this.setEnabled(true);
                });
            }
            getEnabled() {
                return this.enabled;
            };
            setEnabled(enabled) {
                if (!enabled && this.mouseDown) {
                    this.mouseDown = false;
                    this.emit('mouseUp', { clientX: this.mousePosition, clientY: this.mousePosition });
                }
                this.enabled = enabled;
                Game_1.default.currentGame.inputPacketCreator.setEnabled(this.enabled);
            };
            onKeyPress(event) {
                this.keysDown[event.keyCode] = true;
                this.emit('keyPress', event);
            };
            onKeyRelease(event) {
                this.keysDown[event.keyCode] = false;
                this.emit('keyRelease', event);
            };
            onMouseDown(event) {
                if (event.which == 3 || event.button == 2) {
                    if (this.mouseRightDown) {
                        this.emit('mouseRightUp', event);
                    }
                    this.mouseRightDown = true;
                    this.emit('mouseRightDown', event);
                    return;
                }
                if (this.mouseDown) {
                    this.emit('mouseUp', event);
                }
                this.mousePosition = { x: event.clientX, y: event.clientY };
                this.mouseDown = true;
                this.emit('mouseDown', event);
            };
            onMouseUp(event) {
                if (event.which == 3 || event.button == 2) {
                    this.mouseRightDown = false;
                    this.emit('mouseRightUp', event);
                    return;
                }
                this.mousePosition = { x: event.clientX, y: event.clientY };
                this.mouseDown = false;
                this.emit('mouseUp', event);
            };
            onMouseMoved(event) {
                this.mousePosition = { x: event.clientX, y: event.clientY };
                if (this.mouseDown) {
                    this.emit('mouseMovedWhileDown', event);
                } else {
                    this.emit('mouseMoved', event);
                }
            };
        }
        exports.default = InputManager;
        /***/ }),
    /* 252 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        class InputPacketScheduler {
            constructor() {
                this.msElapsedSinceInputSent = 0;
                this.currentPacket = {};
                this.shouldSendPacket = false;
            }
            start() {
                Game_1.default.currentGame.renderer.addTickCallback(this.onRendererTick.bind(this));
            };
            scheduleInput(data) {
                this.currentPacket = data;
                this.shouldSendPacket = true;
                this.sendInputKeys();
            };
            onRendererTick(delta) {
                this.msElapsedSinceInputSent += delta;
                this.sendInputKeys();
            };
            sendInputKeys() {
                let msPerTick = 50;
                if (this.msElapsedSinceInputSent < msPerTick) return;
                if (!this.shouldSendPacket) return;
                Game_1.default.currentGame.network.sendInput(this.currentPacket);
                this.currentPacket = null;
                this.shouldSendPacket = false;
            };
        }
        exports.default = InputPacketScheduler;
        /***/ }),
    /* 253 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        const Util_1 = __webpack_require__(214);
        const events = __webpack_require__(250);
        class InputPacketCreator extends events.EventEmitter {
            constructor() {
                super();
                this.lastMouseMoveYaw = -1;
                this.lastMouseDragYaw = -1;
                this.lastAnyYaw = 0;
                this.enabled = false;
            }
            start() {
                this.bindKeys();
                this.bindMouse();
            };
            getLastAnyYaw() {
                return this.lastAnyYaw;
            };
            getEnabled() {
                return this.enabled;
            };
            setEnabled(enabled) {
                this.enabled = enabled;
            };
            bindKeys() {
                Game_1.default.currentGame.inputManager.on('keyPress', (event) => {
                    const keyCode = event.keyCode;
                    const scheduler = Game_1.default.currentGame.inputPacketScheduler;
                    const activeTag = document.activeElement.tagName.toLowerCase();
                    if (!this.enabled || activeTag == 'input' || activeTag == 'textarea') return;
                    switch (keyCode) {
                        case 87:
                        case 38:
                            scheduler.scheduleInput({ up: 1, down: 0 });
                            break;
                        case 83:
                        case 40:
                            scheduler.scheduleInput({ down: 1, up: 0 });
                            break;
                        case 65:
                        case 37:
                            scheduler.scheduleInput({ left: 1, right: 0 });
                            break;
                        case 68:
                        case 39:
                            scheduler.scheduleInput({ right: 1, left: 0 });
                            break;
                        case 32:
                            scheduler.scheduleInput({ space: 1 });
                            scheduler.scheduleInput({ space: 0 });
                            break;
                        default:
                            return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                });
                Game_1.default.currentGame.inputManager.on('keyRelease', (event) => {
                    const keyCode = event.keyCode;
                    const scheduler = Game_1.default.currentGame.inputPacketScheduler;
                    const activeTag = document.activeElement.tagName.toLowerCase();
                    if (!this.enabled || activeTag == 'input' || activeTag == 'textarea') return;
                    switch (keyCode) {
                        case 87:
                        case 38:
                            scheduler.scheduleInput({ up: 0 });
                            break;
                        case 83:
                        case 40:
                            scheduler.scheduleInput({ down: 0 });
                            break;
                        case 65:
                        case 37:
                            scheduler.scheduleInput({ left: 0 });
                            break;
                        case 68:
                        case 39:
                            scheduler.scheduleInput({ right: 0 });
                            break;
                        default:
                            return;
                    }
                    event.preventDefault();
                    event.stopPropagation();
                });
            };
            screenToWorld(event) {
                const worldPos = Game_1.default.currentGame.renderer.screenToWorld(event.clientX, event.clientY);
                worldPos.x = worldPos.x | 0;
                worldPos.y = worldPos.y | 0;
                return worldPos;
            };
            bindMouse() {
                Game_1.default.currentGame.inputManager.on('mouseDown', (event) => {
                    const yaw = this.screenToYaw(event.clientX, event.clientY);
                    if (!this.enabled || event.returnValue === false) return;
                    const worldPos = this.screenToWorld(event);
                    const distance = this.distanceToCenter(event.clientX, event.clientY);
                    Game_1.default.currentGame.inputPacketScheduler.scheduleInput({
                        mouseDown: yaw,
                        worldX: worldPos.x,
                        worldY: worldPos.y,
                        distance: distance
                    });
                });
                Game_1.default.currentGame.inputManager.on('mouseUp', (event) => {
                    if (!this.enabled || event.returnValue === false) return;
                    this.lastMouseDragYaw = -1;
                    const worldPos = this.screenToWorld(event);
                    const distance = this.distanceToCenter(event.clientX, event.clientY);
                    Game_1.default.currentGame.inputPacketScheduler.scheduleInput({
                        mouseUp: 1,
                        worldX: worldPos.x,
                        worldY: worldPos.y,
                        distance: distance
                    });
                });
                Game_1.default.currentGame.inputManager.on('mouseMovedWhileDown', (event) => {
                    if (!this.enabled || event.returnValue === false) return;
                    const yaw = this.screenToYaw(event.clientX, event.clientY);
                    if (this.lastMouseDragYaw == yaw) return;
                    this.lastMouseDragYaw = yaw;
                    this.lastAnyYaw = yaw;
                    const worldPos = this.screenToWorld(event);
                    const distance = this.distanceToCenter(event.clientX, event.clientY);
                    Game_1.default.currentGame.inputPacketScheduler.scheduleInput({
                        mouseMovedWhileDown: yaw,
                        worldX: worldPos.x,
                        worldY: worldPos.y,
                        distance: distance
                    });
                });
                Game_1.default.currentGame.inputManager.on('mouseMoved', (event) => {
                    if (!this.enabled || event.returnValue === false) return;
                    const yaw = this.screenToYaw(event.clientX, event.clientY);
                    if (this.lastMouseMoveYaw == yaw) return;
                    this.lastMouseMoveYaw = yaw;
                    this.lastAnyYaw = yaw;
                    const worldPos = this.screenToWorld(event);
                    const distance = this.distanceToCenter(event.clientX, event.clientY);
                    Game_1.default.currentGame.inputPacketScheduler.scheduleInput({
                        mouseMoved: yaw,
                        worldX: worldPos.x,
                        worldY: worldPos.y,
                        distance: distance
                    });
                });
            };
            distanceToCenter(x, y) {
                const cx = Game_1.default.currentGame.renderer.getWidth() / 2;
                const cy = Game_1.default.currentGame.renderer.getHeight() / 2;
                const dx = (x - cx);
                const dy = (y - cy);
                return Math.round(Math.sqrt(dx * dx + dy * dy));
            };
            screenToYaw(x, y) {
                const angle = Math.round(Util_1.default.angleTo(Game_1.default.currentGame.renderer.getWidth() / 2, Game_1.default.currentGame.renderer.getHeight() / 2, x, y));
                return angle % 360;
            };
        }
        exports.default = InputPacketCreator;
        /***/ }),
    /* 254 */
    /***/ (function(module, exports, __webpack_require__) {
        /***/ }),
    /* 255 */
    /***/ (function(module, exports) {
        /***/ }),
    /* 256 */
    /***/ (function(module, exports, __webpack_require__) {
        /***/ }),
    /* 257 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const NetworkEntity_1 = __webpack_require__(247);
        const LocalPlayer_1 = __webpack_require__(207);
        const Game_1 = __webpack_require__(2);
        const Replication_1 = __webpack_require__(258);
        const Debug = __webpack_require__(192);
        const debug = Debug('Engine:Game/World');
        class World {
            constructor() {
                this.entities = new Map();
                this.inWorld = false;
                this.myUid = null;
                this.networkEntityPool = [];
                this.modelEntityPool = {};
                this.removedEntityFades = [];
                this.deadEntityUids = {};
                this.deathFadeEligibleUids = {};
                this.network = Game_1.default.currentGame.network;
                this.renderer = Game_1.default.currentGame.renderer;
                this.replicator = new Replication_1.default();
                this.localPlayer = new LocalPlayer_1.default();
            }
            init() {
                this.replicator.setTargetTickUpdatedCallback(this.onEntityUpdate.bind(this));
                this.replicator.init();
                this.network.addEnterWorldHandler(this.onEnterWorld.bind(this));
                this.renderer.addTickCallback(this.onRendererTick.bind(this));
            };
            preloadNetworkEntities() {
                if (!Game_1.default.currentGame.getNetworkEntityPooling()) return;
                let bsTick = { uid: 0, entityClass: null };
                let poolSize = Game_1.default.currentGame.getNetworkEntityPooling();
                for (let i = 0; i < poolSize; i++) {
                    const entity = new NetworkEntity_1.default(bsTick);
                    entity.reset();
                    this.networkEntityPool.push(entity);
                }
            };
            preloadModelEntities() {
                const modelsToPool = Game_1.default.currentGame.getModelEntityPooling();
                for (let modelName in modelsToPool) {
                    const poolSize = modelsToPool[modelName];
                    this.modelEntityPool[modelName] = [];
                    for (let i = 0; i < poolSize; i++) {
                        let model = Game_1.default.currentGame.assetManager.loadModel(modelName);
                        model.modelName = modelName;
                        model.preload();
                        this.modelEntityPool[modelName].push(model);
                    }
                }
            };
            getTickRate() {
                return this.tickRate;
            };
            getMsPerTick() {
                return this.msPerTick;
            };
            getReplicator() {
                return this.replicator;
            };
            getHeight() {
                return this.height;
            };
            getWidth() {
                return this.width;
            };
            getLocalPlayer() {
                return this.localPlayer;
            };
            getInWorld() {
                return this.inWorld;
            };
            getMyUid() {
                return this.myUid;
            };
            getEntityByUid(uid) {
                return this.entities.get(uid);
            };
            getPooledNetworkEntityCount() {
                return this.networkEntityPool.length;
            };
            getModelFromPool(modelName) {
                if (this.modelEntityPool[modelName].length === 0) return null;
                return this.modelEntityPool[modelName].shift();
            };
            getPooledModelEntityCount(modelName) {
                if (!(modelName in this.modelEntityPool)) return 0;
                return this.modelEntityPool[modelName].length;
            };
            onEnterWorld(data) {
                this.allowed = data.allowed;
                if (!data.allowed) return;
                this.width = data.x2;
                this.height = data.y2;
                this.tickRate = data.tickRate;
                this.msPerTick = 1000 / data.tickRate;
                this.inWorld = true;
                this.myUid = data.uid;
            };
            onEntityUpdate(data) {
                data.entities.forEach(e => {
                    if (e !== true && e.uid) {
                        if (e.dead === 1) {
                            this.deadEntityUids[e.uid] = 1;
                        } else {
                            delete this.deadEntityUids[e.uid];
                        }
                    }
                });
                this.entities.forEach(e => {
                    let uid = e.uid;
                    let entity = data.entities.get(uid);
                    if (!entity) {
                        this.removeEntity(uid);
                    } else if (entity !== true) {
                        this.updateEntity(uid, entity);
                    } else {
                        this.updateEntity(uid, {uid: e.uid});
                    }
                })
                data.entities.forEach(e => {
                    if (e !== true) {
                        if (!this.entities.get(e.uid)) {
                            this.createEntity(e);
                        }
                        if (e.dead == 1 && this.entities.get(e.uid)) {
                            this.updateEntity(e.uid, e);
                            return;
                        }
                        if (this.localPlayer != null && this.localPlayer.getEntity() == this.entities.get(e.uid)) {
                            this.localPlayer.setTargetTick(e);
                        }
                    }
                })
            };
            createEntity(data) {
                let entity;
                if (Game_1.default.currentGame.getNetworkEntityPooling() && this.networkEntityPool.length > 0) {
                    entity = this.networkEntityPool.shift();
                    entity.setTargetTick(data);
                    entity.uid = data.uid;
                } else {
                    entity = new NetworkEntity_1.default(data);
                }
                entity.refreshModel(data.model);
                if (data.uid === this.myUid) {
                    this.localPlayer.setEntity(entity);
                    this.renderer.follow(entity);
                }
                this.entities.set(data.uid, entity);
                this.renderer.add(entity, data.entityClass);
            };
            updateEntity(uid, data) {
                let entity = this.entities.get(uid);
                this.updateDeathFadeEligibility(entity, data);
                if (this.shouldFadeDeadEntityUpdate(entity, data)) {
                    entity.setTargetTick(data);
                    this.entities.delete(uid);
                    this.beginRemovedEntityFade(entity);
                    return;
                }
                entity.setTargetTick(data);
            };
            isZombieEntity(entity) {
                return entity && entity.entityClass === 'Npc' && entity.currentModel &&
                    (entity.currentModel.modelName === 'ZombieModel' || entity.currentModel.modelName === 'ZombieBossModel');
            };
            updateDeathFadeEligibility(entity, data) {
                if (!this.isZombieEntity(entity) || !data) return;
                let tick = entity.getTargetTick && entity.getTargetTick();
                let oldHealth = tick && typeof tick.health === 'number' ? tick.health : null;
                let newHealth = typeof data.health === 'number' ? data.health : null;
                let maxHealth = typeof data.maxHealth === 'number' ? data.maxHealth : tick && typeof tick.maxHealth === 'number' ? tick.maxHealth : null;
                let healthDrop = oldHealth !== null && newHealth !== null ? Math.max(0, oldHealth - newHealth) : 0;
                let lowHealth = maxHealth && newHealth !== null ? newHealth <= maxHealth * 0.2 : false;
                if (data.dead == 1 || data.timeDead || newHealth === 0 || healthDrop >= 1000 || healthDrop >= 300 && lowHealth) {
                    this.deathFadeEligibleUids[entity.uid] = performance.now() + 1000;
                }
            };
            shouldFadeDeadEntityUpdate(entity, data) {
                if (!data || data.dead !== 1) return false;
                return this.isZombieEntity(entity);
            };
            removeEntity(uid) {
                let entity = this.entities.get(uid);
                if (!entity) return;
                if (this.shouldFadeRemovedEntity(entity)) {
                    this.entities.delete(uid);
                    this.beginRemovedEntityFade(entity);
                    return;
                }
                this.finishRemoveEntity(uid, entity);
            };
            shouldFadeRemovedEntity(entity) {
                if (!this.isZombieEntity(entity)) return false;
                if (!entity.getNode().visible || !this.isEntityOnScreen(entity)) return false;
                let tick = entity.getTargetTick && entity.getTargetTick();
                let eligibleUntil = this.deathFadeEligibleUids[entity.uid] || 0;
                if (!(this.deadEntityUids[entity.uid] || tick && tick.dead == 1 || eligibleUntil > performance.now())) return false;
                return true;
            };
            isEntityOnScreen(entity) {
                let screenPos = this.renderer.worldToScreen(entity.getPositionX(), entity.getPositionY());
                let margin = 320;
                return screenPos.x >= margin && screenPos.y >= margin &&
                    screenPos.x <= this.renderer.getWidth() - margin &&
                    screenPos.y <= this.renderer.getHeight() - margin;
            };
            beginRemovedEntityFade(entity) {
                const fadeDurationMs = 1000;
                entity.isDeathFading = true;
                if (entity.currentModel && entity.currentModel.healthBar) {
                    entity.currentModel.healthBar.setVisible(false);
                }
                entity.setAlpha(1);
                entity.setTint && entity.setTint(0xFFFFFF);
                this.removedEntityFades.push({
                    entity: entity,
                    elapsed: 0,
                    duration: fadeDurationMs
                });
            };
            updateRemovedEntityFades(delta) {
                for (let i = this.removedEntityFades.length - 1; i >= 0; i--) {
                    let fade = this.removedEntityFades[i];
                    fade.elapsed += delta;
                    let percent = Math.min(fade.elapsed / fade.duration, 1);
                    let shadowPercent = Math.min(percent / 0.18, 1);
                    let shade = Math.max(0, Math.round(255 * (1 - shadowPercent)));
                    fade.entity.setTint && fade.entity.setTint((shade << 16) | (shade << 8) | shade);
                    fade.entity.setAlpha(1 - percent);
                    if (percent >= 1) {
                        this.finishRemoveEntity(fade.entity.uid, fade.entity, false);
                        this.removedEntityFades.splice(i, 1);
                    }
                }
            };
            finishRemoveEntity(uid, entity, deleteFromMap = true) {
                let model = entity.currentModel;
                delete this.deadEntityUids[uid];
                delete this.deathFadeEligibleUids[uid];
                entity.isDeathFading = false;
                entity.setAlpha(1);
                this.renderer.remove(entity);
                if (Game_1.default.currentGame.getModelEntityPooling(model.modelName)) {
                    model.reset();
                    this.modelEntityPool[model.modelName].push(model);
                }
                if (Game_1.default.currentGame.getNetworkEntityPooling()) {
                    entity.reset();
                    this.networkEntityPool.push(entity);
                }
                if (deleteFromMap) {
                    this.entities.delete(uid);
                }
            };
            onRendererTick(delta) {
                let msInThisTick = this.replicator.getMsInThisTick();
                this.entities.forEach(e => {
                    e.tick(msInThisTick, this.msPerTick);
                });
                this.updateRemovedEntityFades(delta);
            };
        }
        exports.default = World;
        /***/ }),
    /* 258 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        const Debug = __webpack_require__(192);
        const debug = Debug('Engine:Network/Replication');
        class Replication {
            constructor() {
                this.currentTick = null;
                this.ticks = [];
                this.shiftedGameTime = 0;
                this.lastShiftedGameTime = 0;
                this.receivedFirstTick = false;
                this.serverTime = 0;
                this.msPerTick = 0;
                this.msInThisTick = 0;
                this.msElapsed = 0;
                this.lastMsElapsed = 0;
                this.ping = 0;
                this.lastPing = 0;
                this.startTime = null;
                this.startShiftedGameTime = 0;
                this.frameStutters = 0;
                this.frameTimes = [];
                this.interpolating = false;
                this.ticksDesynced = 0;
                this.ticksDesynced2 = 0;
                this.clientTimeResets = 0;
                this.maxExtrapolationTime = 0;
                this.totalExtrapolationTime = 0;
                this.extrapolationIncidents = 0;
                this.differenceInClientTime = 0;
                this.equalTimes = 0;
                this.wasRendererJustUnpaused = false;
            }
            init() {
                Game_1.default.currentGame.network.addEnterWorldHandler(this.onEnterWorld.bind(this));
                Game_1.default.currentGame.network.addEntityUpdateHandler(this.onEntityUpdate.bind(this));
                Game_1.default.currentGame.renderer.addTickCallback(this.onTick.bind(this));
            };
            setTargetTickUpdatedCallback(tickUpdatedCallback) {
                this.tickUpdatedCallback = tickUpdatedCallback;
            };
            getClientTimeResets() {
                return this.clientTimeResets;
            };
            getMsInThisTick() {
                return this.msInThisTick;
            };
            getMsPerTick() {
                return this.msPerTick;
            };
            getMsSinceTick(tick, useInterpolationOffset = true) {
                if (useInterpolationOffset) {
                    tick += 2;
                }
                return this.shiftedGameTime - tick * this.msPerTick;
            };
            getMsUntilTick(tick) {
                return tick * this.msPerTick - this.shiftedGameTime;
            };
            getServerTime() {
                return Math.floor(this.serverTime);
            };
            getClientTime() {
                return Math.floor(this.shiftedGameTime);
            };
            getRealClientTime() {
                if (this.startTime == null) return 0;
                let msElapsed = Date.now() - this.startTime;
                return this.startShiftedGameTime + msElapsed;
            };
            getFrameStutters() {
                return this.frameStutters;
            };
            getDifferenceInClientTime() {
                return this.differenceInClientTime;
            };
            isFpsReady() {
                return this.frameTimes.length >= 10;
            };
            getFps() {
                let time = 0;
                for (let i = 0; i < this.frameTimes.length; i++) {
                    time += this.frameTimes[i];
                }
                return 1000 / (time / this.frameTimes.length);
            };
            getInterpolating() {
                return this.interpolating;
            };
            getTickByteSize() {
                if (this.currentTick == null) return 0;
                return this.currentTick.byteSize;
            };
            getTickEntities() {
                if (this.currentTick == null) return 0;
                return this.currentTick.entities.size;
            };
            getTickIndex() {
                if (this.currentTick == null) return 0;
                return this.currentTick.tick;
            };
            getLastMsElapsed() {
                return this.lastMsElapsed;
            };
            getMaxExtrapolationTime() {
                return this.maxExtrapolationTime;
            };
            getExtrapolationIncidents() {
                return this.extrapolationIncidents;
            };
            getTotalExtrapolationTime() {
                return this.totalExtrapolationTime;
            };
            resetClientLag() {
                this.shiftedGameTime = this.getRealClientTime();
            };
            onTick(msElapsed) {
                this.msElapsed += msElapsed;
                this.lastMsElapsed = msElapsed;
                this.frameTimes.push(msElapsed);
                if (this.frameTimes.length > 10) {
                    this.frameTimes.shift();
                }
                let steps = 0;
                const timestep = 1000 / 60;
                while (this.msElapsed >= timestep) {
                    this.msElapsed -= timestep;
                    steps++;
                }
                if (steps > 1) this.frameStutters++;
                if (this.isRendererPaused()) {
                    this.wasRendererJustUnpaused = true;
                    this.equalTimes = 0;
                    msElapsed = 0;
                }
                this.serverTime += msElapsed;
                this.shiftedGameTime += msElapsed;
                this.msInThisTick += msElapsed;
                this.updateTick();
            };
            updateTick() {
                for (let i = 0; i < this.ticks.length; i++) {
                    const tick = this.ticks[i];
                    const tickStart = this.msPerTick * tick.tick;
                    if (this.shiftedGameTime >= tickStart || window.justreconnected) {
                        window.justreconnected && (this.shiftedGameTime = tickStart + 1);
                        window.justreconnected = false;
                        this.currentTick = tick;
                        this.msInThisTick = this.shiftedGameTime - tickStart;
                        this.tickUpdatedCallback(tick);
                        this.ticks.shift();
                        i--;
                    }
                }
                if (this.currentTick != null) {
                    const nextTickStart = this.msPerTick * (this.currentTick.tick + 1);
                    if (this.shiftedGameTime >= nextTickStart) {
                        if (this.interpolating) {
                            this.interpolating = false;
                            this.extrapolationIncidents++;
                        }
                        this.maxExtrapolationTime = Math.max(this.shiftedGameTime - nextTickStart, this.maxExtrapolationTime);
                        const extrapolationTime = Math.min(this.msInThisTick - this.msPerTick, this.lastMsElapsed);
                        this.totalExtrapolationTime += extrapolationTime;
                    } else {
                        this.interpolating = true;
                    }
                    if (this.serverTime - this.shiftedGameTime < this.ping) {
                        this.ticksDesynced++;
                    }
                }
            };
            onEnterWorld(data) {
                if (!data.allowed) return;
                this.msPerTick = 1000 / data.tickRate;
                this.msInThisTick = 0;
                this.shiftedGameTime = 0;
                this.serverTime = 0;
                this.receivedFirstTick = false;
                this.msElapsed = 0;
                this.lastMsElapsed = 0;
                this.ping = Game_1.default.currentGame.network.getPing();
                this.lastPing = this.ping;
                this.startTime = null;
                this.startShiftedGameTime = 0;
                this.interpolating = false;
                if (!document.useRequiredEquipment) {
                    document.useRequiredEquipment = true;
                    game.network.sendRpc({name: "BuyItem", itemName: "HatHorns", tier: 1});
                    game.network.sendRpc({name: "BuyItem", itemName: "PetCARL", tier: 1});
                    game.network.sendRpc({name: "BuyItem", itemName: "PetMiner", tier: 1});
                    game.network.sendRpc({name: "EquipItem", itemName: "PetCARL", tier: 1});
                    game.network.sendRpc({name: "EquipItem", itemName: "PetMiner", tier: 1});
                    if (game.network.socket) {
                        game.network.sendPacket(3, {mouseMoved: 15});
                        for (let i = 0; i < 26; i++) {
                            game.network.sendPacket(3, {up: 1});
                        }
                        game.network.sendPacket(9, {
                            name: "Metrics",
                            minFps: 21.74,
                            maxFps: 70.2,
                            currentFps: 60.34,
                            averageFps: 59.7,
                            framesRendered: 7442,
                            framesInterpolated: 7442,
                            framesExtrapolated: 0,
                            allocatedNetworkEntities: 200,
                            currentClientLag: 203,
                            minClientLag: 99,
                            maxClientLag: 398,
                            currentPing: 101.5,
                            minPing: 91,
                            maxPing: 113,
                            averagePing: 96.85,
                            longFrames: 1,
                            stutters: 142,
                            group: 0,
                            isMobile: 0,
                            timeResets: 1,
                            maxExtrapolationTime: 0,
                            extrapolationIncidents: 0,
                            totalExtrapolationTime: 0,
                            differenceInClientTime: 16.7
                        });
                    }
                }
                    if (!document.already81) {
                        document.already81 = true;
                        localStorage.token == undefined && (localStorage.token = "");
                        document.getElementsByClassName("hud-Scripts-grid")[0].innerHTML = `
<div style="text-align:center"><br>
<div class="mainxgrid">
<h3>~ X ~</h3>
<hr />
<div class="mainxskripts">
Figure it out.
</div>
</div>
<div class="mainygrid">
<h3>~ Y ~</h3>
<hr />
<div class="mainyskripts">
Figure it out.
<p class="idk"></p>
</div>
</div>
<div class="mainzgrid">
<h3>~ Z ~</h3>
<hr />
<div class="mainzskripts">
Figure it out.
</div>
</div>
</div>
`
                        document.hasFocus3 = true;
                        let lastTick = Date.now();
                        let _inactiveTick = () => {
                            if (!document.hasFocus() && !document.hasFocus3) !document.stoppedRing && game.renderer.ticker._tick2();
                            if ((Date.now()-lastTick) > 500) {
                                document.hasFocus3 = false;
                            }
                            if (document.hasFocus()) {
                                if (document.hasFocus3 == false) {
                                    document.hasFocus3 = true;
                                }
                            }
                        }
                        let _Tick = () => {
                            if (document.hasFocus() || document.hasFocus3) !document.stoppedRing && game.renderer.ticker._tick2();
                            requestAnimationFrame(_Tick);
                            lastTick = Date.now();
                        }
                        !game.renderer.ticker._tick2 && (game.renderer.ticker._tick2 = game.renderer.ticker._tick, _Tick(), game.network.addPacketHandler(0, () => _inactiveTick()));
                        game.renderer.ticker._tick = () => {};
                        // last edit
                        // timeout log removed...
                        !game.world.oldCreateEntity && (game.world.oldCreateEntity = game.world.createEntity);
                        game.world.createEntity = e => {
                            if (document.disableZombieEntity && (e.entityClass == "Npc" && !e.model.startsWith("ZombieBossTier"))) return;
                            if (document.disableProjectileEntity && e.entityClass == "Projectile") return;
                            if (document.disableTowerEntity && (e.model == "Door" || e.model == "Wall" || e.model == "SlowTrap" || e.model == "ArrowTower" || e.model == "CannonTower" || e.model == "BombTower" || e.model == "MeleeTower" || e.model == "MagicTower" || e.model == "Harvester" || e.model == "GoldMine")) return;
                            if (game.world.entities.get(e.uid)) return;
                            if (e.entityClass) {
                                game.world.oldCreateEntity(e);
                            }
                        }
                        // keeps trees, stones and camps

                        !game.world.removeEntity2 && (game.world.removeEntity2 = game.world.removeEntity);
                        game.world.removeEntity = (uid) => {
                        if (game.world.entities.get(uid).fromTick.model == "Tree" || game.world.entities.get(uid).fromTick.model == "Stone" || game.world.entities.get(uid).fromTick.model == "NeutralCamp") return;
                            game.world.removeEntity2(uid);
                        }

                        let $7 = document.getElementsByClassName("hud-FPS-restart-walkthrough");
                        $7[0].addEventListener("click", () => {
                            document.disableTowerSprite = !document.disableTowerSprite;
                            if (document.disableTowerSprite) {
                                $7[0].innerText = $7[0].innerText.replace("Disable", "Enable");
                                $7[0].className = $7[0].className.replace("green", "red");
                            } else {
                                $7[0].innerText = $7[0].innerText.replace("Enable", "Disable");
                                $7[0].className = $7[0].className.replace("red", "green");
                            }
                        })
                        $7[1].addEventListener("click", () => {
                            document.disableTowerEntity = !document.disableTowerEntity;
                            if (document.disableTowerEntity) {
                                $7[1].innerText = $7[1].innerText.replace("Disable", "Enable");
                                $7[1].className = $7[1].className.replace("green", "red");
                            } else {
                                $7[1].innerText = $7[1].innerText.replace("Enable", "Disable");
                                $7[1].className = $7[1].className.replace("red", "green");
                            }
                        })
                        $7[2].addEventListener("click", () => {
                            document.disableProjectileEntity = !document.disableProjectileEntity;
                            if (document.disableProjectileEntity) {
                                $7[2].innerText = $7[2].innerText.replace("Disable", "Enable");
                                $7[2].className = $7[2].className.replace("green", "red");
                            } else {
                                $7[2].innerText = $7[2].innerText.replace("Enable", "Disable");
                                $7[2].className = $7[2].className.replace("red", "green");
                            }
                        })
                        $7[3].addEventListener("click", () => {
                            document.disableZombieSprite = !document.disableZombieSprite;
                            if (document.disableZombieSprite) {
                                $7[3].innerText = $7[3].innerText.replace("Disable", "Enable");
                                $7[3].className = $7[3].className.replace("green", "red");
                            } else {
                                $7[3].innerText = $7[3].innerText.replace("Enable", "Disable");
                                $7[3].className = $7[3].className.replace("red", "green");
                            }
                        })
                        $7[4].addEventListener("click", () => {
                            document.disableZombieEntity = !document.disableZombieEntity;
                            if (document.disableZombieEntity) {
                                $7[4].innerText = $7[4].innerText.replace("Disable", "Enable");
                                $7[4].className = $7[4].className.replace("green", "red");
                            } else {
                                $7[4].innerText = $7[4].innerText.replace("Enable", "Disable");
                                $7[4].className = $7[4].className.replace("red", "green");
                            }
                        })
                        $7[5].addEventListener("click", () => {
                            document.stoppedRing = !document.stoppedRing;
                            if (document.stoppedRing) {
                                $7[5].innerText = $7[5].innerText.replace("Stop", "Start");
                                $7[5].className = $7[5].className.replace("green", "red");
                            } else {
                                $7[5].innerText = $7[5].innerText.replace("Start", "Stop");
                                $7[5].className = $7[5].className.replace("red", "green");
                            }
                        })
                        $7[6].addEventListener("click", () => {
                            document.show200x200Grid = !document.show200x200Grid;
                            if (document.show200x200Grid) {
                                add200x200Grid();
                                $7[6].innerText = $7[6].innerText.replace("Show", "Hide");
                                $7[6].className = $7[6].className.replace("green", "red");
                            } else {
                                delete200x200Grid();
                                $7[6].innerText = $7[6].innerText.replace("Hide", "Show");
                                $7[6].className = $7[6].className.replace("red", "green");
                            }
                        })
                        $7[7].addEventListener("click", () => {
                            document.hide48x48Grid = !document.hide48x48Grid;
                            if (document.hide48x48Grid) {
                                delete48x48Grid();
                                $7[7].innerText = $7[7].innerText.replace("Hide", "Show");
                                $7[7].className = $7[7].className.replace("green", "red");
                            } else {
                                add48x48Grid();
                                $7[7].innerText = $7[7].innerText.replace("Show", "Hide");
                                $7[7].className = $7[7].className.replace("red", "green");
                            }
                        })
                        $7[8].addEventListener("click", () => {
                            document.show7x7Grid = !document.show7x7Grid;
                            if (document.show7x7Grid) {
                                add7x7Grid();
                                $7[8].innerText = $7[8].innerText.replace("Show", "Hide");
                                $7[8].className = $7[8].className.replace("green", "red");
                            } else {
                                delete7x7Grid();
                                $7[8].innerText = $7[8].innerText.replace("Hide", "Show");
                                $7[8].className = $7[8].className.replace("red", "green");
                            }
                        })
                        const toggleFpsButton = (button, isEnabled, showWord = "Show", hideWord = "Hide") => {
                            if (isEnabled) {
                                button.innerText = button.innerText.replace(showWord, hideWord);
                                button.className = button.className.replace("green", "red");
                            } else {
                                button.innerText = button.innerText.replace(hideWord, showWord);
                                button.className = button.className.replace("red", "green");
                            }
                        };
                        $7[9].addEventListener("click", () => {
                            document.showGreenOutlines = !document.showGreenOutlines;
                            setOutlineVisibility("green", document.showGreenOutlines);
                            toggleFpsButton($7[9], document.showGreenOutlines);
                        })
                        $7[10].addEventListener("click", () => {
                            document.showYellowGreenOutlines = !document.showYellowGreenOutlines;
                            setOutlineVisibility("yellowgreen", document.showYellowGreenOutlines);
                            toggleFpsButton($7[10], document.showYellowGreenOutlines);
                        })
                        document.showSpawnCircle = document.showSpawnCircle === true;
                        document.spawnCircleNodes = document.spawnCircleNodes || [];
                        const setSpawnCircleVisibility = (isVisible) => {
                            document.showSpawnCircle = isVisible;
                            document.spawnCircleNodes = document.spawnCircleNodes.filter((circle) => circle && !circle.destroyed && (!circle.node || !circle.node.destroyed));
                            document.spawnCircleNodes.forEach((circle) => {
                                if (circle.setVisible) circle.setVisible(isVisible);
                                if (circle.node) circle.node.visible = isVisible;
                                circle.visible = isVisible;
                            });
                        };
                        window.setSpawnCircleVisibility = setSpawnCircleVisibility;
                        window.toggleSpawnCircle = () => {
                            setSpawnCircleVisibility(!document.showSpawnCircle);
                            const button = Array.from(document.querySelectorAll("#hud-menu-FPS .hud-FPS-restart-walkthrough")).find((element) => element.innerText.indexOf("Spawn Circle") !== -1);
                            if (button) {
                                button.innerText = document.showSpawnCircle ? "Hide Spawn Circle" : "Show Spawn Circle";
                                button.className = document.showSpawnCircle ? button.className.replace("green", "red") : button.className.replace("red", "green");
                            }
                        };
                        const spawnCircleToggleButton = Array.from(document.querySelectorAll("#hud-menu-FPS .hud-FPS-restart-walkthrough")).find((element) => element.innerText.indexOf("Spawn Circle") !== -1);
                        if (spawnCircleToggleButton) {
                            spawnCircleToggleButton.addEventListener("click", () => {
                                window.toggleSpawnCircle();
                            })
                        }
                        const t6BlueTextureButton = Array.from(document.querySelectorAll("#hud-menu-FPS .hud-FPS-restart-walkthrough")).find((element) => element.innerText.indexOf("T6 Textures") !== -1);
                        const updateT6BlueTextureButton = () => {
                            if (!t6BlueTextureButton) return;
                            t6BlueTextureButton.innerText = document.useBlueT6Textures ? "Use Purple T6 Textures" : "Use Blue T6 Textures";
                            t6BlueTextureButton.className = document.useBlueT6Textures ? t6BlueTextureButton.className.replace("green", "red") : t6BlueTextureButton.className.replace("red", "green");
                        };
                        if (t6BlueTextureButton) {
                            updateT6BlueTextureButton();
                            t6BlueTextureButton.addEventListener("click", () => {
                                document.useBlueT6Textures = !document.useBlueT6Textures;
                                localStorage.t6BlueTextures = document.useBlueT6Textures ? "true" : "false";
                                if (window.applyTierTextureMode) window.applyTierTextureMode();
                                updateT6BlueTextureButton();
                            })
                        }
                        const defaultZombieTextureButton = Array.from(document.querySelectorAll("#hud-menu-FPS .hud-FPS-restart-walkthrough")).find((element) => element.innerText.indexOf("Default Zombies") !== -1 || element.innerText.indexOf("Themed Zombies") !== -1);
                        const updateDefaultZombieTextureButton = () => {
                            if (!defaultZombieTextureButton) return;
                            defaultZombieTextureButton.innerText = document.useDefaultZombieTextures ? "Use Themed Zombies" : "Use Default Zombies";
                            defaultZombieTextureButton.className = document.useDefaultZombieTextures ? defaultZombieTextureButton.className.replace("green", "red") : defaultZombieTextureButton.className.replace("red", "green");
                        };
                        if (defaultZombieTextureButton) {
                            updateDefaultZombieTextureButton();
                            defaultZombieTextureButton.addEventListener("click", () => {
                                document.useDefaultZombieTextures = !document.useDefaultZombieTextures;
                                localStorage.defaultZombieTextures = document.useDefaultZombieTextures ? "true" : "false";
                                if (window.applyTierTextureMode) window.applyTierTextureMode();
                                updateDefaultZombieTextureButton();
                            })
                        }
                        function opengridthing(type = "y") {
                            document.getElementsByClassName("mainxgrid")[0].style.display = "none";
                            document.getElementsByClassName("mainygrid")[0].style.display = "none";
                            document.getElementsByClassName("mainzgrid")[0].style.display = "none";
                            document.getElementsByClassName("main" + type + "grid")[0].style.display = "block";
                        }
                        window.opengridthing = opengridthing;
                        document.getElementsByClassName("mxyz")[0].innerHTML = `
<button class="mx" onclick="opengridthing('x');" style="width: 27%; font-family: Hammersmith One, sans-serif">~ X ~</button>
<button class="my" onclick="opengridthing('y');" style="width: 27%; font-family: Hammersmith One, sans-serif">~ Y ~</button>
<button class="mz" onclick="opengridthing('z');" style="width: 27%; font-family: Hammersmith One, sans-serif">~ Z ~</button>
`;
                        opengridthing();
                        let added = false;
                        const mapTexture = PIXI.Texture.from(`./asset/pictures/map/map_1.png`);
                        const map2Texture = PIXI.Texture.from(`./asset/pictures/map/map_2.png`);
                        let grassTexture;
                        let biomeContainer;
                        const lines = [];
                        const outlineGroups = {
                            green: false,
                            yellowgreen: false,
                            yellow: false
                        };
                        let walls = [];
                        const createBiomeOverlay = () => {
                            if (biomeContainer) biomeContainer.destroy({ children: true });
                            biomeContainer = new PIXI.Container();
                            const size = 24000;
                            const half = size / 2;
                            const addRect = (x, y, w, h, color, alpha) => {
                                const g = new PIXI.Graphics();
                                g.beginFill(color, alpha);
                                g.drawRect(x, y, w, h);
                                g.endFill();
                                biomeContainer.addChild(g);
                                return g;
                            };
                            const addDot = (x, y, r, color, alpha) => {
                                const g = new PIXI.Graphics();
                                g.beginFill(color, alpha);
                                g.drawCircle(x, y, r);
                                g.endFill();
                                biomeContainer.addChild(g);
                            };
                            addRect(0, 0, half + 1800, half + 1800, 0xbfdce6, 0.17);
                            addRect(half - 1800, 0, half + 1800, half + 1800, 0x5f8f3a, 0.08);
                            addRect(0, half - 1800, half + 1800, half + 1800, 0xb8752f, 0.13);
                            addRect(half - 1800, half - 1800, half + 1800, half + 1800, 0xd5b35e, 0.16);
                            addRect(half - 2300, 0, 4600, size, 0x4f6d35, 0.055);
                            addRect(0, half - 2300, size, 4600, 0x4f6d35, 0.055);
                            const center = new PIXI.Graphics();
                            center.beginFill(0x151c1d, 0.35);
                            center.drawCircle(half, half, 2700);
                            center.endFill();
                            center.beginFill(0x263018, 0.16);
                            center.drawCircle(half, half, 3800);
                            center.endFill();
                            biomeContainer.addChild(center);
                            for (let i = 0; i < 170; i++) {
                                let x = (i * 1973) % half;
                                let y = (i * 1237) % half;
                                addDot(x, y, 5 + i % 5, 0xf2f7ff, 0.34);
                            }
                            for (let i = 0; i < 130; i++) {
                                let x = (i * 1697) % half;
                                let y = half + (i * 1181) % half;
                                addDot(x, y, 6 + i % 4, i % 2 ? 0xd46d2f : 0x9f3f25, 0.28);
                            }
                            for (let i = 0; i < 120; i++) {
                                let x = half + (i * 1601) % half;
                                let y = half + (i * 1327) % half;
                                addDot(x, y, 7 + i % 5, i % 2 ? 0x8f7a3c : 0xc9a855, 0.2);
                            }
                            for (let i = 0; i < 85; i++) {
                                let x = half - 2500 + (i * 431) % 5000;
                                let y = half - 2500 + (i * 719) % 5000;
                                addDot(x, y, 9 + i % 8, 0x101414, 0.26);
                            }
                            game.world.renderer.entities.node.addChild(biomeContainer);
                        };
                        const liftGameplayLayers = () => {
                            game.world.renderer.entities.node.addChild(game.world.renderer.ground.node);
                            game.world.renderer.entities.node.addChild(game.world.renderer.scenery.node);
                            game.world.renderer.entities.node.addChild(game.world.renderer.npcs.node);
                            game.world.renderer.entities.node.addChild(game.world.renderer.projectiles.node);
                            game.world.renderer.entities.node.addChild(game.world.renderer.players.node);
                        };
                        const normalizeOutlineColor = (color) => {
                            if (color === "green") return "green";
                            if (color === "yellow" || color === "gold") return "yellow";
                            if (color === "yellowgreen" || color === "yellowishgreen" || color === "lime" || color === "red") return "yellowgreen";
                            return color;
                        };
                        const getOutlineFill = (color) => {
                            let outlineColor = normalizeOutlineColor(color);
                            if (outlineColor === "green") return 0x00ff00;
                            if (outlineColor === "yellowgreen") return 0xb8d94a;
                            if (outlineColor === "yellow") return 0xffff00;
                            if (color === "white") return 0xffffff;
                            return 0xff8000;
                        };
                        const setOutlineVisibility = (color, isVisible) => {
                            outlineGroups[color] = isVisible;
                            lines.forEach((line) => {
                                if (line.outlineColorKey === color) line.visible = isVisible;
                            });
                        };
                        document.showGreenOutlines = false;
                        document.showYellowGreenOutlines = false;
                        document.showYellowOutlines = false;
                        $7[9].click();
                        $7[10].click();
                        spawnCircleToggleButton.click();
                        const createBorder = (x, y, size, color) => {
                            let obj = new PIXI.Graphics();
                            obj.outlineColorKey = normalizeOutlineColor(color);
                            obj.beginFill(getOutlineFill(color));
                            obj.drawRect(x, y, size, size);
                            obj.alpha = 0.1;
                            if (Object.prototype.hasOwnProperty.call(outlineGroups, obj.outlineColorKey)) obj.visible = outlineGroups[obj.outlineColorKey];
                            obj.x = -size / 2;
                            obj.y = -size / 2;
                            game.world.renderer.ground.node.addChild(obj);
                            lines.push(obj);
                        }
                        const add200x200Grid = () => {
                            if (added) return;
                            added = true;
                            grassTexture = new PIXI.TilingSprite(mapTexture);
                            grassTexture.x = 0;
                            grassTexture.y = 0;
                            grassTexture.width = 24000;
                            grassTexture.height = 24000;
                            grassTexture.anchor.x = 0;
                            grassTexture.anchor.y = 0;
                            game.world.renderer.entities.node.addChild(grassTexture);
                            liftGameplayLayers();
                        }
                        const delete200x200Grid = () => {
                            if (!added) return;
                            added = false;
                            if (biomeContainer) {
                                biomeContainer.destroy({ children: true });
                                biomeContainer = null;
                            }
                            grassTexture.destroy();
                        }
                        const add48x48Grid = () => {
                            game.world.renderer.ground.setVisible(true);
                        }
                        const delete48x48Grid = () => {
                            game.world.renderer.ground.setVisible(false);
                        }
                        const add7x7Grid = () => {
                            for (let i in walls) {
                                walls[i].destroy();
                            }
                            walls = [];
                            game.world.entities.forEach(e => {
                                if (e.targetTick.model !== "Wall") return;
                                let wallRange = new PIXI.Sprite(map2Texture);
                                wallRange.scale.set(7);
                                wallRange.x = e.targetTick.position.x - 168;
                                wallRange.y = e.targetTick.position.y - 168;
                                game.world.renderer.entities.node.addChild(wallRange);
                                walls.push(wallRange);                                
                            });
                        }
                        const delete7x7Grid = () => {
                            for (let i in walls) {
                                walls[i].destroy();
                            }
                            walls = [];
                        }
                        window.add200x200Grid = add200x200Grid;
                        window.delete200x200Grid = delete200x200Grid;
                        window.add48x48Grid = add48x48Grid;
                        window.delete48x48Grid = delete48x48Grid;
                        window.add7x7Grid = add7x7Grid;
                        window.delete7x7Grid = delete7x7Grid;
                        window.createBorder = createBorder;
                        window.setOutlineVisibility = setOutlineVisibility;
                        window.lines = lines;
                        const renderActions = window.zombsRenderActions || (window.zombsRenderActions = {});
                        const getSavedRenderStates = () => {
                            try {
                                return JSON.parse(localStorage.zombsRenderStates || "{}") || {};
                            } catch {
                                return {};
                            }
                        };
                        const saveRenderState = (id, isActive) => {
                            const states = getSavedRenderStates();
                            states[id] = !!isActive;
                            localStorage.zombsRenderStates = JSON.stringify(states);
                        };
                        const setRenderAction = (id, label, isActive, toggle) => {
                            renderActions[id] = {
                                getLabel: label,
                                isActive,
                                toggle: () => {
                                    toggle();
                                    saveRenderState(id, !!isActive());
                                }
                            };
                        };
                        window.applySavedRenderStates = () => {
                            const states = getSavedRenderStates();
                            Object.keys(states).forEach((id) => {
                                const action = renderActions[id];
                                if (!action || !action.isActive || !action.toggle) return;
                                if (!!action.isActive() !== !!states[id]) action.toggle();
                            });
                        };
                        setRenderAction("tower-sprite",
                            () => document.disableTowerSprite ? "Enable Tower Sprite Entity" : "Disable Tower Sprite Entity",
                            () => !!document.disableTowerSprite,
                            () => { document.disableTowerSprite = !document.disableTowerSprite; });
                        setRenderAction("tower-entity",
                            () => document.disableTowerEntity ? "Enable Tower Entity" : "Disable Tower Entity",
                            () => !!document.disableTowerEntity,
                            () => { document.disableTowerEntity = !document.disableTowerEntity; });
                        setRenderAction("projectile-entity",
                            () => document.disableProjectileEntity ? "Enable Projectile Entity" : "Disable Projectile Entity",
                            () => !!document.disableProjectileEntity,
                            () => { document.disableProjectileEntity = !document.disableProjectileEntity; });
                        setRenderAction("zombie-sprite",
                            () => document.disableZombieSprite ? "Enable Zombie Sprite Entity" : "Disable Zombie Sprite Entity",
                            () => !!document.disableZombieSprite,
                            () => { document.disableZombieSprite = !document.disableZombieSprite; });
                        setRenderAction("zombie-entity",
                            () => document.disableZombieEntity ? "Enable Zombie Entity" : "Disable Zombie Entity",
                            () => !!document.disableZombieEntity,
                            () => { document.disableZombieEntity = !document.disableZombieEntity; });
                        setRenderAction("rendering",
                            () => document.stoppedRing ? "Start Rendering" : "Stop Rendering",
                            () => !!document.stoppedRing,
                            () => { document.stoppedRing = !document.stoppedRing; });
                        setRenderAction("grid-200",
                            () => document.show200x200Grid ? "Hide 200x200 Grid" : "Show 200x200 Grid",
                            () => !!document.show200x200Grid,
                            () => {
                                document.show200x200Grid = !document.show200x200Grid;
                                document.show200x200Grid ? add200x200Grid() : delete200x200Grid();
                            });
                        setRenderAction("ground",
                            () => document.hide48x48Grid ? "Show Ground" : "Hide Ground",
                            () => !!document.hide48x48Grid,
                            () => {
                                document.hide48x48Grid = !document.hide48x48Grid;
                                document.hide48x48Grid ? delete48x48Grid() : add48x48Grid();
                            });
                        setRenderAction("grid-7",
                            () => document.show7x7Grid ? "Hide 7x7 Grid" : "Show 7x7 Grid",
                            () => !!document.show7x7Grid,
                            () => {
                                document.show7x7Grid = !document.show7x7Grid;
                                document.show7x7Grid ? add7x7Grid() : delete7x7Grid();
                            });
                        setRenderAction("stash-placement",
                            () => document.showGreenOutlines ? "Hide Stash Placement" : "Show Stash Placement",
                            () => !!document.showGreenOutlines,
                            () => {
                                document.showGreenOutlines = !document.showGreenOutlines;
                                setOutlineVisibility("green", document.showGreenOutlines);
                            });
                        setRenderAction("stash-range",
                            () => document.showYellowGreenOutlines ? "Hide Stash Range" : "Show Stash Range",
                            () => !!document.showYellowGreenOutlines,
                            () => {
                                document.showYellowGreenOutlines = !document.showYellowGreenOutlines;
                                setOutlineVisibility("yellowgreen", document.showYellowGreenOutlines);
                            });
                        setRenderAction("spawn-circle",
                            () => document.showSpawnCircle ? "Hide Spawn Circle" : "Show Spawn Circle",
                            () => !!document.showSpawnCircle,
                            () => setSpawnCircleVisibility(!document.showSpawnCircle));
                        setRenderAction("t6-textures",
                            () => document.useBlueT6Textures ? "Use Purple T6 Textures" : "Use Blue T6 Textures",
                            () => !!document.useBlueT6Textures,
                            () => {
                                document.useBlueT6Textures = !document.useBlueT6Textures;
                                localStorage.t6BlueTextures = document.useBlueT6Textures ? "true" : "false";
                                if (window.applyTierTextureMode) window.applyTierTextureMode();
                            });
                        setRenderAction("default-zombies",
                            () => document.useDefaultZombieTextures ? "Use Themed Zombies" : "Use Default Zombies",
                            () => !!document.useDefaultZombieTextures,
                            () => {
                                document.useDefaultZombieTextures = !document.useDefaultZombieTextures;
                                localStorage.defaultZombieTextures = document.useDefaultZombieTextures ? "true" : "false";
                                if (window.applyTierTextureMode) window.applyTierTextureMode();
                            });
                        window.applySavedRenderStates();
                        if (window.ban && window.ban.syncRenderButtons) window.ban.syncRenderButtons();
                    }
            };
            checkRendererPaused() {
                if (this.lastShiftedGameTime == this.shiftedGameTime) {
                    this.equalTimes++;
                } else {
                    this.equalTimes = 0;
                }
            };
            isRendererPaused() {
                return this.equalTimes >= 8;
            };
            onEntityUpdate(data) {
                this.serverTime = data.tick * this.msPerTick + this.ping;
                this.ticks.push(data);
                if (!this.receivedFirstTick) {
                    this.receivedFirstTick = true;
                    this.startTime = Date.now();
                    this.shiftedGameTime = data.tick * this.msPerTick - 90;
                    this.startShiftedGameTime = this.shiftedGameTime;
                    this.clientTimeResets = 0;
                } else {
                    this.checkRendererPaused();
                    let rendererPaused = this.isRendererPaused();
                    let differenceInClientLag = (data.tick * this.msPerTick - 90) - this.shiftedGameTime;
                    if (!rendererPaused) {
                        this.differenceInClientTime = differenceInClientLag;
                    }
                    if (Math.abs(differenceInClientLag) >= 40) {
                        this.ticksDesynced2++;
                    } else {
                        this.ticksDesynced2 = 0;
                    }
                    if (this.ticksDesynced2 >= 10 || this.wasRendererJustUnpaused) {
                        let last = this.shiftedGameTime;
                        this.shiftedGameTime = data.tick * this.msPerTick - 90;
                        this.msInThisTick += (this.shiftedGameTime - last);
                        if (!rendererPaused && !this.wasRendererJustUnpaused) {
                            this.clientTimeResets++;
                        }
                        this.ticksDesynced2 = 0;
                        this.wasRendererJustUnpaused = false;
                    }
                    this.lastShiftedGameTime = this.shiftedGameTime;
                }
            };
        }
        exports.default = Replication;
        /***/ }),
    /* 259 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const Game_1 = __webpack_require__(2);
        const NetworkAdapter_1 = __webpack_require__(260);
        const BinCodec_1 = __webpack_require__(262);
        const packetIds = __webpack_require__(261);
        const Debug = __webpack_require__(192);
        const debug = Debug('Engine:Network/BinNetworkAdapter');
        class BinNetworkAdapter extends NetworkAdapter_1.default {
            constructor() {
                super();
                this.pingStart = null;
                this.pingCompletion = null;
                this.ping = 0;
                this.connected = false;
                this.connecting = false;
                this.codec = new BinCodec_1.default();
                this.addConnectHandler(this.sendPingIfNecessary.bind(this));
                this.addPingHandler(this.onPing.bind(this));
                this.emitter.on('connected', (event) => {
                    this.connecting = false;
                    this.connected = true;
                });
                this.emitter.on('close', (event) => {
                    this.connecting = false;
                    this.connected = false;
                    if (Game_1.default.currentGame.world.getInWorld()) {
                        setTimeout(this.reconnect(window.autoreconnect), 1000);
                    } else if (!Game_1.default.currentGame.world.getInWorld() && this.connectionOptions.fallbackPort) {
                        let fallbackPort = this.connectionOptions.fallbackPort;
                        delete this.connectionOptions.fallbackPort;
                        this.connectionOptions.port = fallbackPort;
                        this.reconnect(window.allowed1);
                    }
                });
            }
            connect(options) {
                if (this.connecting) return;
                this.connectionOptions = options;
                this.connected = false;
                this.connecting = true;
                this.socket = new WebSocket('wss://' + options.host + ':' + options.port);
                this.socket.binaryType = 'arraybuffer';
                this.bindEventListeners();
                setTimeout(() => {
                    game.ui.components.Reconnect.hide();
                }, 1000);
            };
            bindEventListeners() {
                this.socket.addEventListener('open', this.emitter.emit.bind(this.emitter, 'connected'));
                this.socket.addEventListener('message', this.onMessage.bind(this));
                this.socket.addEventListener('close', this.emitter.emit.bind(this.emitter, 'close'));
                this.socket.addEventListener('error', this.emitter.emit.bind(this.emitter, 'error'));
            };
            disconnect() {
                //this.socket.close();
            };
            reconnect(allowed) {
                allowed && this.connect(this.connectionOptions);
            };
            getPing() {
                return this.ping;
            };
            sendPacket(event, data) {
                if (!this.connected || !data) return;
                if (event == 3 || event == 4 || event == 5 || event == 6 || event == 7 || event == 9) {
                    this.socket.send(this.codec.encode(event, data));
                }
            };
            onMessage(event) {
                if (isMade == 0) {
                    isMade = 1;
                    Module = wasmmodule();
                }
                this.sendPingIfNecessary();
                const data = new Uint8Array(event.data);
                if (data[0] == 10) {
                    return game.network.socket.send(Module.finalizeOpcode10(data));
                }
                if (data[0] == 5) {
                    Module.onDecodeOpcode5(new Uint8Array(data), game.network.connectionOptions.hostname, decodedOpcode5 => {
                        this.sendPacket(4, {displayName: localStorage.name, extra: decodedOpcode5[5]});
                        this.enterworld2 = decodedOpcode5[6]
                    });
                    return;
                }
                const message = this.codec.decode(event.data);
                this.emitter.emit(packetIds.default[message.opcode], message);
            };
            sendPingIfNecessary() {
                this.connecting = false;
                this.connected = true;
                if (this.pingStart != null) return;
                if (this.pingCompletion != null) {
                    if ((Date.now() - this.pingCompletion.getTime()) <= 5250) return;
                }
                this.pingStart = new Date();
                if (game.debug.visible && (document.hasFocus3 || document.hasFocus())) {
                    //game.network.socket.send(new Uint8Array([7, 0]));
                    //game.network.socket.send(new Uint8Array([9,6,0,0,0,126,8,0,0,108,27,0,0,146,23,0,0,82,23,0,0,8,91,11,0,8,91,11,0,0,0,0,0,32,78,0,0,76,79,0,0,172,38,0,0,120,155,0,0,166,39,0,0,140,35,0,0,36,44,0,0,213,37,0,0,100,0,0,0,120,55,0,0,0,0,0,0,0,0,0,0,100,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,134,6,0,0]));
                }
            };
            onPing() {
                if (!this.pingStart) return;
                let now = new Date();
                this.ping = (now.getTime() - this.pingStart.getTime()) / 2;
                this.pingStart = null;
                this.pingCompletion = now;
            };
        }
        exports.default = BinNetworkAdapter;
        /***/ }),
    /* 260 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        const packetIds = __webpack_require__(261);
        const events = __webpack_require__(250);
        class NetworkAdapter {
            constructor() {
                this.emitter = new events.EventEmitter();
                this.emitter.setMaxListeners(50);
            }
            sendEnterWorld(data) {
                this.sendPacket(packetIds.default.PACKET_ENTER_WORLD, data);
            };
            sendInput(data) {
                this.sendPacket(packetIds.default.PACKET_INPUT, data);
            };
            sendPing(data) {
                this.sendPacket(packetIds.default.PACKET_PING, data);
            };
            sendRpc(data) {
                this.sendPacket(packetIds.default.PACKET_RPC, data);
            };
            addEnterWorldHandler(callback) {
                this.addPacketHandler(packetIds.default.PACKET_ENTER_WORLD, (response) => {
                    callback(response);
                });
            };
            addPreEnterWorldHandler(callback) {
                this.addPacketHandler(5, (response) => {
                    const decodedOpcode5 = Module.decodePreEnterWorldResponse(response.extra, game.network.connectionOptions.hostname);
                    this.enterworld2 = Module.encodeEnterWorld2();
                    callback(decodedOpcode5);
                });
            };
            addEntityUpdateHandler(callback) {
                this.addPacketHandler(packetIds.default.PACKET_ENTITY_UPDATE, (response) => {
                    callback(response);
                });
            };
            addPingHandler(callback) {
                this.addPacketHandler(packetIds.default.PACKET_PING, (response) => {
                    callback(response);
                });
            };
            addRpcHandler(name, callback) {
                this.addPacketHandler(packetIds.default.PACKET_RPC, (response) => {
                    if (name == response.name) {
                        callback(response.response);
                    }
                });
            };
            addConnectHandler(callback) {
                this.emitter.on('connected', callback);
            };
            addCloseHandler(callback) {
                this.emitter.on('close', callback);
            };
            addErrorHandler(callback) {
                this.emitter.on('error', callback);
            };
            addPacketHandler(event, callback) {
                this.emitter.on(packetIds.default[event], callback);
            };
        }
        exports.default = NetworkAdapter;
        /***/ }),
    /* 261 */
    /***/ ((module, exports) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        exports.default = {"0":"PACKET_ENTITY_UPDATE","1":"PACKET_PLAYER_COUNTER_UPDATE","2":"PACKET_SET_WORLD_DIMENSIONS","3":"PACKET_INPUT","4":"PACKET_ENTER_WORLD","5":"PACKET_PRE_ENTER_WORLD","6":"PACKET_ENTER_WORLD2","7":"PACKET_PING","9":"PACKET_RPC","PACKET_ENTITY_UPDATE":0,"PACKET_PLAYER_COUNTER_UPDATE":1,"PACKET_SET_WORLD_DIMENSIONS":2,"PACKET_INPUT":3,"PACKET_ENTER_WORLD":4,"PACKET_PRE_ENTER_WORLD":5,"PACKET_ENTER_WORLD2":6,"PACKET_PING":7,"PACKET_RPC":9};
        /***/ }),
    /* 262 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let packetIds = __webpack_require__(261);
        let Debug = __webpack_require__(192);
        let debug = Debug('Engine:Network/BinCodec');
        let attributeTypes = {"0":"Uninitialized","1":"Uint32","2":"Int32","3":"Float","4":"String","5":"Vector2","6":"EntityType","7":"ArrayVector2","8":"ArrayUint32","9":"Uint16","10":"Uint8","11":"Int16","12":"Int8","13":"Uint64","14":"Int64","15":"Double","Uninitialized":0,"Uint32":1,"Int32":2,"Float":3,"String":4,"Vector2":5,"EntityType":6,"ArrayVector2":7,"ArrayUint32":8,"Uint16":9,"Uint8":10,"Int16":11,"Int8":12,"Uint64":13,"Int64":14,"Double":15}
        let parameterTypes = {"0":"Uint32","1":"Int32","2":"Float","3":"String","4":"Uint64","5":"Int64","Uint32":0,"Int32":1,"Float":2,"String":3,"Uint64":4,"Int64":5}
        class BinCodec {
            constructor() {
                this.attributeMaps = {}
                this.entityTypeNames = {};
                this.rpcMaps = [];
                this.rpcMapsByName = {};
                this.sortedUidsByType = {};
                this.removedEntities = {};
                this.absentEntitiesFlags = [];
                this.updatedEntityFlags = [];
            }
            encode(name, item) {
                const buffer = new ByteBuffer(100, true);
                switch (name) {
                    case packetIds.default.PACKET_ENTER_WORLD:
                        buffer.writeUint8(packetIds.default.PACKET_ENTER_WORLD);
                        this.encodeEnterWorld(buffer, item);
                        break;
                    case packetIds.default.PACKET_ENTER_WORLD2:
                        buffer.writeUint8(packetIds.default.PACKET_ENTER_WORLD2);
                        this.encodeEnterWorld2(buffer);
                        break;
                    case packetIds.default.PACKET_INPUT:
                        buffer.writeUint8(packetIds.default.PACKET_INPUT);
                        this.encodeInput(buffer, item);
                        break;
                    case packetIds.default.PACKET_PING:
                        buffer.writeUint8(packetIds.default.PACKET_PING);
                        this.encodePing(buffer, item);
                        break;
                    case packetIds.default.PACKET_RPC:
                        buffer.writeUint8(packetIds.default.PACKET_RPC);
                        this.encodeRpc(buffer, item);
                        break;
                }
                buffer.flip();
                buffer.compact();
                return buffer.toArrayBuffer(false);
            };
            decode(data) {
                let buffer = ByteBuffer.wrap(data);
                buffer.littleEndian = true;
                let opcode = buffer.readUint8();
                let decoded;
                switch (opcode) {
                    case packetIds.default.PACKET_PRE_ENTER_WORLD:
                        decoded = this.decodePreEnterWorldResponse(buffer);
                        break;
                    case packetIds.default.PACKET_ENTER_WORLD:
                        decoded = this.decodeEnterWorldResponse(buffer);
                        break;
                    case packetIds.default.PACKET_ENTITY_UPDATE:
                        decoded = this.decodeEntityUpdate(buffer);
                        break;
                    case packetIds.default.PACKET_PING:
                        decoded = this.decodePing(buffer);
                        break;
                    case packetIds.default.PACKET_RPC:
                        decoded = this.decodeRpc(buffer);
                        break;
                }
                decoded.opcode = opcode;
                return decoded;
            };
            safeReadVString(buffer) {
                let offset = buffer.offset;
                let len = buffer.readVarint32(offset);
                try {
                    let func = buffer.readUTF8String.bind(buffer);
                    let str = func(len.value, "b", offset += len.length);
                    offset += str.length;
                    buffer.offset = offset;
                    return str.string;
                }
                catch (e) {
                    offset += len.value;
                    buffer.offset = offset;
                    return '?';
                }
            };
            decodePreEnterWorldResponse(buffer) {
                return {
                    extra: new Uint8Array(buffer.buffer)
                };
            }
            decodeEnterWorldResponse(buffer) {
                let allowed = buffer.readUint32();
                let uid = buffer.readUint32();
                let startingTick = buffer.readUint32();
                let ret = {
                    allowed: allowed,
                    uid: uid,
                    startingTick: startingTick,
                    tickRate: buffer.readUint32(),
                    effectiveTickRate: buffer.readUint32(),
                    players: buffer.readUint32(),
                    maxPlayers: buffer.readUint32(),
                    chatChannel: buffer.readUint32(),
                    effectiveDisplayName: this.safeReadVString(buffer),
                    x1: buffer.readInt32(),
                    y1: buffer.readInt32(),
                    x2: buffer.readInt32(),
                    y2: buffer.readInt32()
                };
                let attributeMapCount = buffer.readUint32();
                this.attributeMaps = {};
                this.entityTypeNames = {};
                for (let i = 0; i < attributeMapCount; i++) {
                    let attributeMap = [];
                    let entityType = buffer.readUint32();
                    let entityTypeString = buffer.readVString();
                    let attributeCount = buffer.readUint32();
                    for (let j = 0; j < attributeCount; j++) {
                        let name_1 = buffer.readVString();
                        let type = buffer.readUint32();
                        attributeMap.push({
                            name: name_1,
                            type: type
                        });
                    }
                    this.attributeMaps[entityType] = attributeMap;
                    this.entityTypeNames[entityType] = entityTypeString;
                    this.sortedUidsByType[entityType] = [];
                }
                let rpcCount = buffer.readUint32();
                this.rpcMaps = [];
                this.rpcMapsByName = {};
                for (let i = 0; i < rpcCount; i++) {
                    let rpcName = buffer.readVString();
                    let paramCount = buffer.readUint8();
                    let isArray = buffer.readUint8() != 0;
                    let parameters = [];
                    for (let j = 0; j < paramCount; j++) {
                        let paramName = buffer.readVString();
                        let paramType = buffer.readUint8();
                        parameters.push({
                            name: paramName,
                            type: paramType
                        });
                    }
                    let rpc = {
                        name: rpcName,
                        parameters: parameters,
                        isArray: isArray,
                        index: this.rpcMaps.length
                    };
                    this.rpcMaps.push(rpc);
                    this.rpcMapsByName[rpcName] = rpc;
                }
                return ret;
            };
            decodeEntityUpdate(buffer) {
                let tick = buffer.readUint32();
                let removedEntityCount = buffer.readVarint32();
                const entityUpdateData = {};
                entityUpdateData.tick = tick;
                entityUpdateData.entities = new Map();
                let rE = Object.keys(this.removedEntities);
                for (let i = 0; i < rE.length; i++) {
                    delete this.removedEntities[rE[i]];
                }
                for (let i = 0; i < removedEntityCount; i++) {
                    let uid = buffer.readUint32();
                    this.removedEntities[uid] = 1;
                }
                let brandNewEntityTypeCount = buffer.readVarint32();
                for (let i = 0; i < brandNewEntityTypeCount; i++) {
                    let brandNewEntityCountForThisType = buffer.readVarint32();
                    let brandNewEntityType = buffer.readUint32();
                    for (let j = 0; j < brandNewEntityCountForThisType; j++) {
                        let brandNewEntityUid = buffer.readUint32();
                        this.sortedUidsByType[brandNewEntityType].push(brandNewEntityUid);
                    }
                }
                let SUBT = Object.keys(this.sortedUidsByType);
                for (let i = 0; i < SUBT.length; i++) {
                    let table = this.sortedUidsByType[SUBT[i]];
                    let newEntityTable = [];
                    for (let j = 0; j < table.length; j++) {
                        let uid = table[j];
                        if (!(uid in this.removedEntities)) {
                            newEntityTable.push(uid);
                        }
                    }
                    newEntityTable.sort((a, b) => a - b);
                    this.sortedUidsByType[SUBT[i]] = newEntityTable;
                }
                while (buffer.remaining()) {
                    let entityType = buffer.readUint32();
                    if (!(entityType in this.attributeMaps)) {
                        throw new Error('Entity type is not in attribute map: ' + entityType);
                    }
                    let absentEntitiesFlagsLength = Math.floor((this.sortedUidsByType[entityType].length + 7) / 8);
                    this.absentEntitiesFlags.length = 0;
                    for (let i = 0; i < absentEntitiesFlagsLength; i++) {
                        this.absentEntitiesFlags.push(buffer.readUint8());
                    }
                    let attributeMap = this.attributeMaps[entityType];
                    for (let tableIndex = 0; tableIndex < this.sortedUidsByType[entityType].length; tableIndex++) {
                        let uid = this.sortedUidsByType[entityType][tableIndex];
                        if ((this.absentEntitiesFlags[Math.floor(tableIndex / 8)] & (1 << (tableIndex % 8))) !== 0) {
                            entityUpdateData.entities.set(uid, true);
                            continue;
                        }
                        let player = {uid: uid};
                        this.updatedEntityFlags.length = 0;
                        for (let j = 0; j < Math.ceil(attributeMap.length / 8); j++) {
                            this.updatedEntityFlags.push(buffer.readUint8());
                        }
                        for (let j = 0; j < attributeMap.length; j++) {
                            let attribute = attributeMap[j];
                            let flagIndex = Math.floor(j / 8);
                            let bitIndex = j % 8;
                            let count = void 0;
                            let v = [];
                            if (this.updatedEntityFlags[flagIndex] & (1 << bitIndex)) {
                                switch (attribute.type) {
                                    case attributeTypes.Uint32:
                                        player[attribute.name] = buffer.readUint32();
                                        break;
                                    case attributeTypes.Int32:
                                        player[attribute.name] = buffer.readInt32();
                                        break;
                                    case attributeTypes.Float:
                                        player[attribute.name] = buffer.readInt32() / 100;
                                        break;
                                    case attributeTypes.String:
                                        player[attribute.name] = this.safeReadVString(buffer);
                                        break;
                                    case attributeTypes.Vector2:
                                        let x = buffer.readInt32() / 100;
                                        let y = buffer.readInt32() / 100;
                                        player[attribute.name] = { x: x, y: y };
                                        break;
                                    case attributeTypes.ArrayVector2:
                                        count = buffer.readInt32();
                                        v = [];
                                        for (let i = 0; i < count; i++) {
                                            let x_1 = buffer.readInt32() / 100;
                                            let y_1 = buffer.readInt32() / 100;
                                            v.push({ x: x_1, y: y_1 });
                                        }
                                        player[attribute.name] = v;
                                        break;
                                    case attributeTypes.ArrayUint32:
                                        count = buffer.readInt32();
                                        v = [];
                                        for (let i = 0; i < count; i++) {
                                            let element = buffer.readInt32();
                                            v.push(element);
                                        }
                                        player[attribute.name] = v;
                                        break;
                                    case attributeTypes.Uint16:
                                        player[attribute.name] = buffer.readUint16();
                                        break;
                                    case attributeTypes.Uint8:
                                        player[attribute.name] = buffer.readUint8();
                                        break;
                                    case attributeTypes.Int16:
                                        player[attribute.name] = buffer.readInt16();
                                        break;
                                    case attributeTypes.Int8:
                                        player[attribute.name] = buffer.readInt8();
                                        break;
                                    case attributeTypes.Uint64:
                                        player[attribute.name] = buffer.readUint32() + buffer.readUint32() * 4294967296;
                                        break;
                                    case attributeTypes.Int64:
                                        let s64 = buffer.readUint32();
                                        let s642 = buffer.readInt32();
                                        if (s642 < 0) {
                                            s64 *= -1;
                                        }
                                        s64 += s642 * 4294967296;
                                        player[attribute.name] = s64;
                                        break;
                                    case attributeTypes.Double:
                                        let s64d = buffer.readUint32();
                                        let s64d2 = buffer.readInt32();
                                        if (s64d2 < 0) {
                                            s64d *= -1;
                                        }
                                        s64d += s64d2 * 4294967296;
                                        s64d = s64d / 100;
                                        player[attribute.name] = s64d;
                                        break;
                                    default:
                                        throw new Error('Unsupported attribute type: ' + attribute.type);
                                }
                            }
                        }
                        entityUpdateData.entities.set(player.uid, player);
                    }
                }
                entityUpdateData.byteSize = buffer.capacity();
                return entityUpdateData;
            };
            decodePing(buffer) {
                return {};
            };
            encodeRpc(buffer, item) {
                if (!(item.name in this.rpcMapsByName)) {
                    throw new Error('RPC not in map: ' + item.name);
                }
                let rpc = this.rpcMapsByName[item.name];
                buffer.writeUint32(rpc.index);
                for (let i = 0; i < rpc.parameters.length; i++) {
                    let param = item[rpc.parameters[i].name];
                    switch (rpc.parameters[i].type) {
                        case parameterTypes.Float:
                            buffer.writeInt32(Math.floor(param * 100.0));
                            break;
                        case parameterTypes.Int32:
                            buffer.writeInt32(param);
                            break;
                        case parameterTypes.String:
                            buffer.writeVString(param);
                            break;
                        case parameterTypes.Uint32:
                            buffer.writeUint32(param);
                            break;
                    }
                }
            };
            decodeRpcObject(buffer, parameters) {
                let result = {};
                for (let i = 0; i < parameters.length; i++) {
                    switch (parameters[i].type) {
                        case parameterTypes.Uint32:
                            result[parameters[i].name] = buffer.readUint32();
                            break;
                        case parameterTypes.Int32:
                            result[parameters[i].name] = buffer.readInt32();
                            break;
                        case parameterTypes.Float:
                            result[parameters[i].name] = buffer.readInt32() / 100.0;
                            break;
                        case parameterTypes.String:
                            result[parameters[i].name] = this.safeReadVString(buffer);
                            break;
                        case parameterTypes.Uint64:
                            result[parameters[i].name] = buffer.readUint32() + buffer.readUint32() * 4294967296;
                            break;
                    }
                }
                return result;
            };
            decodeRpc(buffer) {
                let rpcIndex = buffer.readUint32();
                let rpc = this.rpcMaps[rpcIndex];
                let result = {
                    name: rpc.name,
                    response: null
                };
                if (!rpc.isArray) {
                    result.response = this.decodeRpcObject(buffer, rpc.parameters);
                } else {
                    let response = [];
                    let count = buffer.readUint16();
                    for (let i = 0; i < count; i++) {
                        response.push(this.decodeRpcObject(buffer, rpc.parameters));
                    }
                    result.response = response;
                }
                return result;
            };
            encodeEnterWorld(buffer, item) {
                buffer.writeVString(item.displayName);
                for (let e = new Uint8Array(item.extra), i = 0; i < item.extra.byteLength; i++) {
                    buffer.writeUint8(e[i]);
                }
            }
            encodeEnterWorld2(buffer) {
                let managementcommandsdns = Module._MakeBlendField(187, 22);
                for (let siteName = 0; siteName < 16; siteName++) {
                    buffer.writeUint8(Module.HEAPU8[managementcommandsdns + siteName]);
                }
            };
            encodeInput(buffer, item) {
                buffer.writeVString(JSON.stringify(item));
            };
            encodePing(buffer, item) {
                buffer.writeUint8(0);
            };
        }
        exports.default = BinCodec;
        /***/ }),
    /* 263 */
    /***/ (function(module, exports, __webpack_require__) {
        /***/ }),
    /* 264 */
    /***/ ((module, exports) => {
        module.exports = function (module) {
            if (!module.webpackPolyfill) {
                module.deprecate = function () {};
                module.paths = [];
                module.children = [];
                module.webpackPolyfill = 1;
            }
            return module;
        };
        /***/ }),
    /* 265 */
    /***/ (function(module, exports) {
        module.exports = function() { throw new Error("define cannot be used indirect"); };
        /***/ }),
    /* 266 */
    /***/ (function(module, exports, __webpack_require__) {
        var __WEBPACK_AMD_DEFINE_FACTORY__, __WEBPACK_AMD_DEFINE_ARRAY__, __WEBPACK_AMD_DEFINE_RESULT__;
        (function(module) {
            var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };
            (function (global, factory) {
            if ("function" === 'function' && __webpack_require__(265)["amd"]) !(__WEBPACK_AMD_DEFINE_ARRAY__ = [], __WEBPACK_AMD_DEFINE_FACTORY__ = (factory), __WEBPACK_AMD_DEFINE_RESULT__ = (typeof __WEBPACK_AMD_DEFINE_FACTORY__ === 'function' ? (__WEBPACK_AMD_DEFINE_FACTORY__.apply(exports, __WEBPACK_AMD_DEFINE_ARRAY__)) : __WEBPACK_AMD_DEFINE_FACTORY__), __WEBPACK_AMD_DEFINE_RESULT__ !== undefined && (module.exports = __WEBPACK_AMD_DEFINE_RESULT__));
            else if ("function" === 'function' && ( false ? 'undefined' : _typeof(module)) === "object" && module && module["exports"]) module["exports"] = factory();
            else (global["dcodeIO"] = global["dcodeIO"] || {})["Long"] = factory();
            })(undefined, function () {});
            }.call(exports, __webpack_require__(264)(module)))
        /***/ }),
    /* 267 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(2);
        let Stats = __webpack_require__(268);
        class Debug {
            constructor() {
                this.visible = false;
                this.ticks = 0;
            }
            init() {
                var debugHtml = '<div id="hud-debug" class="hud-debug" style="position:fixed;top:112px;left:20px;color:#ff0000;font-family:Hammersmith One,sans-serif;"></div>';
                this.stats = new Stats();
                this.stats.domElement.style.position = 'fixed';
                this.stats.domElement.style.left = '20px';
                this.stats.domElement.style.top = '20px';
                this.stats.domElement.style.transform = 'scale(1.5)';
                this.stats.domElement.style.transformOrigin = 'top left';
                document.body.appendChild(this.stats.domElement);
                document.body.insertAdjacentHTML('beforeend', debugHtml);
                this.debugElem = document.getElementById('hud-debug');
                Game_1.default.currentGame.renderer.addTickCallback(this.onRendererTick.bind(this));
                Game_1.default.currentGame.inputManager.on('keyRelease', this.onKeyRelease.bind(this));
                this.stats.domElement.style.display = 'none';
                this.debugElem.style.display = 'none';
            };
            begin() {
                if (!this.stats || !this.visible) return;
                this.stats.begin();
            };
            end() {
                if (!this.stats || !this.visible) return;
                this.stats.end();
            };
            show() {
                this.visible = true;
                this.stats.domElement.style.display = 'block';
                this.debugElem.style.display = 'block';
            };
            hide() {
                this.visible = false;
                this.stats.domElement.style.display = 'none';
                this.debugElem.style.display = 'none';
            };
            onRendererTick() {
                this.ticks++;
                if (!this.visible) return;
                if (this.ticks % 20 !== 0) return;
                const text = `Ping: ${Game_1.default.currentGame.network.getPing()} ms<br>
                Server time: ${Game_1.default.currentGame.world.getReplicator().getServerTime()} ms<br>
                Client time: ${Game_1.default.currentGame.world.getReplicator().getClientTime()} ms<br>
                Real client time: ${Game_1.default.currentGame.world.getReplicator().getRealClientTime()} ms<br>
                Client lag: ${(Game_1.default.currentGame.world.getReplicator().getServerTime() - Game_1.default.currentGame.world.getReplicator().getClientTime())} ms<br>
                Real client lag: ${(Game_1.default.currentGame.world.getReplicator().getServerTime() - Game_1.default.currentGame.world.getReplicator().getRealClientTime())} ms<br>
                Stutters: ${Game_1.default.currentGame.world.getReplicator().getFrameStutters()}<br>
                Frames extrapolated: ${Game_1.default.currentGame.metrics.getFramesExtrapolated()}<br>
                Max extrapolation time: ${Game_1.default.currentGame.world.getReplicator().getMaxExtrapolationTime()}<br>
                Client time resets: ${Game_1.default.currentGame.world.getReplicator().getClientTimeResets()}<br>
                FPS: ${Math.round(Game_1.default.currentGame.world.getReplicator().getFps())}<br>
                Interpolating: ${Game_1.default.currentGame.world.getReplicator().getInterpolating()}<br>
                Tick byte size: ${Game_1.default.currentGame.world.getReplicator().getTickByteSize()}<br>
                Tick entities: ${Game_1.default.currentGame.world.getReplicator().getTickEntities()}<br>
                Pooled network entities: ${Game_1.default.currentGame.world.getPooledNetworkEntityCount()}<br>
                `;
                this.debugElem.innerHTML = text;
            };
            onKeyRelease(event) {
                if (event.keyCode == 117) {
                    if (this.visible) {
                        this.hide();
                    } else {
                        this.show();
                    }
                }
            };
        }
        exports.default = Debug;
        /***/ }),
    /* 268 */
    /***/ (function(module, exports, __webpack_require__) {

            var Stats = function() {
                function e(e) {
                    return n.appendChild(e.dom),
                    e
                }
                function t(e) {
                    for (var t = 0; t < n.children.length; t++)
                        n.children[t].style.display = t === e ? "block" : "none";
                    l = e
                }
                var l = 0
                  , n = document.createElement("div");
                n.style.cssText = "cursor:pointer;opacity:0.9",
                n.addEventListener("click", function(e) {
                    e.preventDefault(),
                    t(++l % n.children.length)
                }, !1);
                var a = (performance || Date).now()
                  , i = a
                  , o = 0
                  , r = e(new Stats.Panel("FPS","#0ff","#002"))
                  , f = e(new Stats.Panel("MS","#0f0","#020"));
                if (self.performance && self.performance.memory)
                    var c = e(new Stats.Panel("MB","#f08","#201"));
                return t(0),
                {
                    REVISION: 16,
                    domElement: n,
                    addPanel: e,
                    showPanel: t,
                    setMode: t,
                    begin: function() {
                        a = (performance || Date).now()
                    },
                    end: function() {
                        o++;
                        var e = (performance || Date).now();
                        if (f.update(e - a, 200),
                        e > i + 1e3 && (r.update(1e3 * o / (e - i), 100),
                        i = e,
                        o = 0,
                        c)) {
                            var t = performance.memory;
                            c.update(t.usedJSHeapSize / 1048576, t.jsHeapSizeLimit / 1048576)
                        }
                        return e
                    },
                    update: function() {
                        a = this.end()
                    }
                }
            };
            Stats.Panel = function(e, t, l) {
                var n = 1 / 0
                  , a = 0
                  , i = Math.round
                  , o = i(window.devicePixelRatio || 1)
                  , r = 80 * o
                  , f = 48 * o
                  , c = 3 * o
                  , d = 2 * o
                  , s = 3 * o
                  , p = 15 * o
                  , u = 74 * o
                  , m = 30 * o
                  , h = document.createElement("canvas");
                h.width = r,
                h.height = f,
                h.style.cssText = "width:80px;height:48px";
                var S = h.getContext("2d");
                return S.font = "bold " + 9 * o + "px Helvetica,Arial,sans-serif",
                S.textBaseline = "top",
                S.fillStyle = l,
                S.fillRect(0, 0, r, f),
                S.fillStyle = t,
                S.fillText(e, c, d),
                S.fillRect(s, p, u, m),
                S.fillStyle = l,
                S.globalAlpha = .9,
                S.fillRect(s, p, u, m),
                {
                    dom: h,
                    update: function(f, v) {
                        n = Math.min(n, f),
                        a = Math.max(a, f),
                        S.fillStyle = l,
                        S.globalAlpha = 1,
                        S.fillRect(0, 0, r, p),
                        S.fillStyle = t,
                        S.fillText(i(f) + " " + e + " (" + i(n) + "-" + i(a) + ")", c, d),
                        S.drawImage(h, s + o, p, u - o, m, s, p, u - o, m),
                        S.fillRect(s + u - o, p, o, m),
                        S.fillStyle = l,
                        S.globalAlpha = .9,
                        S.fillRect(s + u - o, p, o, i((1 - f / v) * m))
                    }
                }
            }
            ,
            "object" == typeof module && (module.exports = Stats);

        /***/ }),
    /* 269 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(2);
        let Util_1 = __webpack_require__(214);
        let Debug = __webpack_require__(192);
        let debug = Debug('Engine:Metrics/Metrics');
        class Metrics {
            constructor() {
                this.msElapsedSinceMetricsSent = 0;
                this.metrics = null;
                this.pingSum = 0;
                this.pingSamples = 0;
                this.shouldSend = false;
                this.fpsSum = 0;
                this.fpsSamples = 0;
                this.reset();
                Game_1.default.currentGame.network.addEnterWorldHandler(() => {
                    this.reset();
                    this.shouldSend = true;
                });
                Game_1.default.currentGame.network.addCloseHandler(() => {
                    this.reset();
                    this.shouldSend = false;
                });
                Game_1.default.currentGame.network.addErrorHandler(() => {
                    this.reset();
                    this.shouldSend = false;
                });
                Game_1.default.currentGame.renderer.addTickCallback((delta) => {
                    if (!this.shouldSend) return;
                    this.msElapsedSinceMetricsSent += delta;
                    if (!this.updateMetrics()) return;
                    this.sendMetrics();
                });
            }
            getFramesExtrapolated() {
                return this.metrics['framesExtrapolated'] || 0;
            };
            reset() {
                this.pingSum = 0;
                this.pingSamples = 0;
                this.fpsSum = 0;
                this.fpsSamples = 0;
                this.metrics = {name: 'Metrics', minFps: null, maxFps: null, currentFps: null, averageFps: null, framesRendered: 0, framesInterpolated: 0, framesExtrapolated: 0, allocatedNetworkEntities: null, currentClientLag: null, minClientLag: null, maxClientLag: null, currentPing: null, minPing: null, maxPing: null, averagePing: null, longFrames: 0, stutters: 0, isMobile: 0, group: 0, timeResets: 0, maxExtrapolationTime: 0, totalExtrapolationTime: 0, extrapolationIncidents: 0, differenceInClientTime: 0};
            };
            updateMetrics() {
                if (!Game_1.default.currentGame.world.getReplicator().isFpsReady()) return false;
                if (!Game_1.default.currentGame.world.getReplicator().getTickIndex()) return false;
                let fps = Game_1.default.currentGame.world.getReplicator().getFps();
                let tickEntities = Game_1.default.currentGame.world.getReplicator().getTickEntities();
                let pooledCount = Game_1.default.currentGame.world.getPooledNetworkEntityCount();
                let st = Game_1.default.currentGame.world.getReplicator().getServerTime();
                let ct = Game_1.default.currentGame.world.getReplicator().getClientTime();
                let ping = Game_1.default.currentGame.network.getPing();
                let clientLag = st - ct;
                if (fps < this.metrics.minFps || this.metrics.minFps === null) {
                    this.metrics.minFps = fps;
                }
                if (fps > this.metrics.maxFps || this.metrics.maxFps === null) {
                    this.metrics.maxFps = fps;
                }
                this.metrics.currentFps = fps;
                this.fpsSamples++;
                this.fpsSum += fps;
                this.metrics.averageFps = this.fpsSum / this.fpsSamples;
                if (Game_1.default.currentGame.world.getReplicator().getInterpolating()) {
                    this.metrics.framesInterpolated++;
                } else {
                    this.metrics.framesExtrapolated++;
                }
                this.metrics.framesRendered++;
                this.metrics.allocatedNetworkEntities = tickEntities + pooledCount;
                this.metrics.currentClientLag = clientLag;
                if (clientLag < this.metrics.minClientLag || this.metrics.minClientLag === null) {
                    this.metrics.minClientLag = clientLag;
                }
                if (clientLag > this.metrics.maxClientLag || this.metrics.maxClientLag === null) {
                    this.metrics.maxClientLag = clientLag;
                }
                this.metrics.currentPing = ping;
                if (ping < this.metrics.minPing || this.metrics.minPing === null) {
                    this.metrics.minPing = ping;
                }
                if (ping > this.metrics.maxPing || this.metrics.maxPing === null) {
                    this.metrics.maxPing = ping;
                }
                this.pingSamples++;
                this.pingSum += ping;
                this.metrics.averagePing = this.pingSum / this.pingSamples;
                this.metrics.stutters = Game_1.default.currentGame.world.getReplicator().getFrameStutters();
                this.metrics.timeResets = Game_1.default.currentGame.world.getReplicator().getClientTimeResets();
                this.metrics.longFrames = Game_1.default.currentGame.renderer.getLongFrames();
                this.metrics.isMobile = Util_1.default.isMobile() ? 1 : 0;
                this.metrics.group = Game_1.default.currentGame.getGroup();
                this.metrics.maxExtrapolationTime = Game_1.default.currentGame.world.getReplicator().getMaxExtrapolationTime();
                this.metrics.totalExtrapolationTime = Game_1.default.currentGame.world.getReplicator().getTotalExtrapolationTime();
                this.metrics.extrapolationIncidents = Game_1.default.currentGame.world.getReplicator().getExtrapolationIncidents();
                this.metrics.differenceInClientTime = Game_1.default.currentGame.world.getReplicator().getDifferenceInClientTime();
                return true;
            };
            sendMetrics() {
                if (this.msElapsedSinceMetricsSent < 5000) return;
                this.msElapsedSinceMetricsSent = 0;
            };
        }
        exports.default = Metrics;
        /***/ }),
    /* 270 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiAnnouncementOverlay_1 = __webpack_require__(271);
        let UiBuildingOverlay_1 = __webpack_require__(273);
        let UiBuffBar_1 = __webpack_require__(274);
        let UiChat_1 = __webpack_require__(276);
        let UiDayNightOverlay_1 = __webpack_require__(287);
        let UiDayNightTicker_1 = __webpack_require__(288);
        let UiHealthBar_1 = __webpack_require__(289);
        let UiIntro_1 = __webpack_require__(290);
        let UiLeaderboard_1 = __webpack_require__(292);
        let UiMap_1 = __webpack_require__(293);
        let UiMenuIcons_1 = __webpack_require__(294);
        let UiMenuParty_1 = __webpack_require__(295);
        let UiMenuShop_1 = __webpack_require__(296);
        let UiMenuSettings_1 = __webpack_require__(300);
        let UiMenuFPS_1 = __webpack_require__(331);
        let UiMenuScripts_1 = __webpack_require__(332);
        let UiPartyIcons_1 = __webpack_require__(301);
        let UiPipOverlay_1 = __webpack_require__(302);
        let UiPlacementOverlay_1 = __webpack_require__(303);
        let UiPopupOverlay_1 = __webpack_require__(304);
        let UiPrerollAd_1 = __webpack_require__(305);
        let UiReconnect_1 = __webpack_require__(306);
        let UiResources_1 = __webpack_require__(307);
        let UiRespawn_1 = __webpack_require__(309);
        let UiShieldBar_1 = __webpack_require__(310);
        let UiSpellIcons_1 = __webpack_require__(311);
        let UiSpellOverlay_1 = __webpack_require__(312);
        let UiToolbar_1 = __webpack_require__(313);
        let UiWalkthrough_1 = __webpack_require__(316);
        let events = __webpack_require__(250);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/Ui');
        let UiAnchor = {"1":"TOP_LEFT","2":"TOP_CENTER","3":"TOP_RIGHT","4":"BOTTOM_LEFT","5":"BOTTOM_CENTER","6":"BOTTOM_RIGHT","7":"CENTER_LEFT","8":"CENTER_RIGHT","TOP_LEFT":1,"TOP_CENTER":2,"TOP_RIGHT":3,"BOTTOM_LEFT":4,"BOTTOM_CENTER":5,"BOTTOM_RIGHT":6,"CENTER_LEFT":7,"CENTER_RIGHT":8};
        class Ui extends events.EventEmitter {
            constructor() {
                super();
                this.components = {};
                this.buildings = {};
                this.buildingSchema = {};
                this.inventory = {};
                this.itemSchema = {};
                this.spellSchema = {};
                this.parties = {};
                this.playerPartyLeader = false;
                this.playerPartyCanSell = true;
                this.options = {};
                this.mousePosition = { x: 0, y: 0 };
                this.isMouseDown = false;
                this.isWavePaused = false;
                this.options = Game_1.default.currentGame.options || {};
                this.buildingSchema = JSON.parse(JSON.stringify(__webpack_require__(317)));
                this.itemSchema = JSON.parse(JSON.stringify(__webpack_require__(318)));
                this.spellSchema = JSON.parse(JSON.stringify(__webpack_require__(319)));
                this.uiElem = this.createElement("<div id=\"hud\" class=\"hud\"></div>");
                this.uiTopLeftElem = this.createElement("<div class=\"hud-top-left\"></div>");
                this.uiTopCenterElem = this.createElement("<div class=\"hud-top-center\"></div>");
                this.uiTopRightElem = this.createElement("<div class=\"hud-top-right\"></div>");
                this.uiBottomLeftElem = this.createElement("<div class=\"hud-bottom-left\"></div>");
                this.uiBottomCenterElem = this.createElement("<div class=\"hud-bottom-center\"></div>");
                this.uiBottomRightElem = this.createElement("<div class=\"hud-bottom-right\"></div>");
                this.uiCenterLeftElem = this.createElement("<div class=\"hud-center-left\"></div>");
                this.uiCenterRightElem = this.createElement("<div class=\"hud-center-right\"></div>");
                this.uiElem.appendChild(this.uiTopLeftElem);
                this.uiElem.appendChild(this.uiTopCenterElem);
                this.uiElem.appendChild(this.uiTopRightElem);
                this.uiElem.appendChild(this.uiBottomLeftElem);
                this.uiElem.appendChild(this.uiBottomCenterElem);
                this.uiElem.appendChild(this.uiBottomRightElem);
                this.uiElem.appendChild(this.uiCenterLeftElem);
                this.uiElem.appendChild(this.uiCenterRightElem);
                this.uiElem.oncontextmenu = function () {
                    return false;
                };
                document.addEventListener('wheel', (event) => {
                    if (event.target && event.target.closest && event.target.closest('.hud-menu')) {
                        event.stopPropagation();
                    }
                }, true);
                document.body.appendChild(this.uiElem);
                this.addComponent('Map', new UiMap_1.default(this), UiAnchor.BOTTOM_LEFT);
                this.addComponent('DayNightTicker', new UiDayNightTicker_1.default(this), UiAnchor.BOTTOM_LEFT);
                this.addComponent('Toolbar', new UiToolbar_1.default(this), UiAnchor.BOTTOM_CENTER);
                this.addComponent('HealthBar', new UiHealthBar_1.default(this), UiAnchor.BOTTOM_RIGHT);
                this.addComponent('ShieldBar', new UiShieldBar_1.default(this), UiAnchor.BOTTOM_RIGHT);
                this.addComponent('Resources', new UiResources_1.default(this), UiAnchor.BOTTOM_RIGHT);
                this.addComponent('PartyIcons', new UiPartyIcons_1.default(this), UiAnchor.BOTTOM_RIGHT);
                this.addComponent('Chat', new UiChat_1.default(this), UiAnchor.TOP_LEFT);
                this.addComponent('Leaderboard', new UiLeaderboard_1.default(this), UiAnchor.TOP_RIGHT);
                this.addComponent('SpellIcons', new UiSpellIcons_1.default(this), UiAnchor.CENTER_LEFT);
                this.addComponent('MenuIcons', new UiMenuIcons_1.default(this), UiAnchor.CENTER_RIGHT);
                this.addComponent('BuffBar', new UiBuffBar_1.default(this));
                this.addComponent('PipOverlay', new UiPipOverlay_1.default(this));
                this.addComponent('PopupOverlay', new UiPopupOverlay_1.default(this));
                this.addComponent('AnnouncementOverlay', new UiAnnouncementOverlay_1.default(this));
                this.addComponent('DayNightOverlay', new UiDayNightOverlay_1.default(this));
                this.addComponent('PlacementOverlay', new UiPlacementOverlay_1.default(this));
                this.addComponent('SpellOverlay', new UiSpellOverlay_1.default(this));
                this.addComponent('BuildingOverlay', new UiBuildingOverlay_1.default(this));
                this.addComponent('MenuParty', new UiMenuParty_1.default(this));
                this.addComponent('MenuShop', new UiMenuShop_1.default(this));
                this.addComponent('MenuSettings', new UiMenuSettings_1.default(this));
                this.addComponent('MenuFPS', new UiMenuFPS_1.default(this));
                this.addComponent('MenuScripts', new UiMenuScripts_1.default(this));
                this.addComponent('Walkthrough', new UiWalkthrough_1.default(this));
                this.addComponent('Reconnect', new UiReconnect_1.default(this));
                this.addComponent('Respawn', new UiRespawn_1.default(this));
                this.addComponent('PrerollAd', new UiPrerollAd_1.default(this));
                this.addComponent('Intro', new UiIntro_1.default(this));
                this.on('itemEquippedOrUsed', this.onItemEquippedOrUsed.bind(this));
                Game_1.default.currentGame.inputManager.on('mouseDown', this.onMouseDown.bind(this));
                Game_1.default.currentGame.inputManager.on('mouseUp', this.onMouseUp.bind(this));
                Game_1.default.currentGame.inputManager.on('mouseRightUp', this.onMouseRightUp.bind(this));
                Game_1.default.currentGame.inputManager.on('mouseMoved', this.onMouseMoved.bind(this));
                Game_1.default.currentGame.inputManager.on('mouseMovedWhileDown', this.onMouseMovedWhileDown.bind(this));
                Game_1.default.currentGame.inputManager.on('keyPress', this.onKeyPress.bind(this));
                Game_1.default.currentGame.inputManager.on('keyRelease', this.onKeyRelease.bind(this));
                Game_1.default.currentGame.network.addConnectHandler(this.onConnectionOpen.bind(this));
                Game_1.default.currentGame.network.addCloseHandler(this.onConnectionClose.bind(this));
                Game_1.default.currentGame.network.addEnterWorldHandler(this.onEnterWorld.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('Shutdown', this.onServerShuttingDown.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('LocalBuilding', this.onLocalBuildingUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('SetItem', this.onLocalItemUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('BuildingShopPrices', this.onBuildingSchemaUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('ItemShopPrices', this.onItemSchemaUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('Spells', this.onSpellSchemaUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('PartyInfo', this.onPartyInfoUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('PartyShareKey', this.onPartyShareKeyUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('AddParty', this.onAddParty.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('RemoveParty', this.onRemoveParty.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('SetPartyList', this.onSetPartyList.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('Failure', this.onGenericFailure.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('Dead', this.onPlayerDeath.bind(this));
                document.addEventListener('dragover', this.onDragOver.bind(this));
                window.addEventListener('beforeunload', this.onBeforeUnload.bind(this));
                this.buildingUids_1 = {};
                this.holdKeys = {};
                document.addEventListener("keydown", e => {
                    if (e.repeat) return;
                    this.holdKeys[e.keyCode] = true;
                })
                document.addEventListener("keyup", e => {
                    this.holdKeys[e.keyCode] = false;
                })
                setInterval(() => {
                    if (this && this.components) {
                        let buildingOverlay = this.components.BuildingOverlay;
                        if (this.holdKeys[84] && !this.holdKeys[16]) {
                            buildingOverlay.sellBuilding();
                            setTimeout(() => {
                                buildingOverlay.sellBuilding();
                                setTimeout(() => {
                                    buildingOverlay.sellBuilding();
                                }, 25)
                            }, 25)
                        }
                    }
                }, 150);
            }
            getBuildings() {
                return this.buildings;
            };
            getBuildingSchema() {
                return this.buildingSchema;
            };
            getInventory() {
                return this.inventory;
            };
            getItemSchema() {
                return this.itemSchema;
            };
            getSpellSchema() {
                return this.spellSchema;
            };
            getParties() {
                return this.parties;
            };
            getPlayerTick() {
                return this.playerTick;
            };
            getPlayerWeaponName() {
                return this.playerWeaponName;
            };
            getPlayerHatName() {
                return this.playerHatName;
            };
            getPlayerPetUid() {
                return this.playerPetUid;
            };
            getPlayerPetName() {
                return this.playerPetName;
            };
            getPlayerPetTick() {
                return this.playerPetTick;
            };
            getPlayerPartyId() {
                return this.playerPartyId;
            };
            getPlayerPartyMembers() {
                return this.playerPartyMembers;
            };
            getPlayerPartyShareKey() {
                return this.playerPartyShareKey;
            };
            getPlayerPartyLeader() {
                return this.playerPartyLeader;
            };
            getPlayerPartyCanSell() {
                return this.playerPartyCanSell;
            };
            getOption(key) {
                return this.options[key];
            };
            setOption(key, value) {
                this.options[key] = value;
            };
            getMousePosition() {
                return this.mousePosition;
            };
            getIsMouseDown() {
                return this.isMouseDown;
            };
            getIsWavePaused() {
                return this.isWavePaused;
            };
            setPlayerTick(tick) {
                tick = Object.assign({}, tick);
                if (tick.partyId && (!this.playerTick || tick.partyId !== this.playerTick.partyId)) {
                    this.playerPartyId = tick.partyId;
                    this.emit('partyJoined', tick.partyId);
                    this.components.BuildingOverlay.stopWatching();
                    this.components.PlacementOverlay.cancelPlacing();
                    this.components.SpellOverlay.cancelCasting();
                    this.components.MenuParty.hide();
                    this.components.MenuShop.hide();
                }
                if (tick.isPaused === 1 && (this.playerTick && this.playerTick.isPaused === 0)) {
                    this.onLocalItemUpdate({itemName: 'Pause', tier: 1, stacks: 1});
                    this.emit('wavePaused');
                } else if (tick.isPaused === 0 && (this.playerTick && this.playerTick.isPaused === 1)) {
                    this.onLocalItemUpdate({itemName: 'Pause', tier: 1, stacks: 0});
                    this.emit('waveResumed');
                }
                if (tick.isInvulnerable === 1 && (!this.playerTick || this.playerTick.isInvulnerable === 0)) {
                    this.onLocalItemUpdate({itemName: 'Invulnerable', tier: 1, stacks: 1});
                    this.emit('playerInvulnerable');
                } else if (tick.isInvulnerable === 0 && (this.playerTick && this.playerTick.isInvulnerable === 1)) {
                    this.onLocalItemUpdate({itemName: 'Invulnerable', tier: 1, stacks: 0});
                    this.emit('playerVulnerable');
                }
                if (tick.lastDamageTick > 0 && this.playerTick && tick.lastDamageTick !== this.playerTick.lastDamageTick) {
                    this.emit('playerDidDamage', tick);
                }
                if (tick.lastPetDamageTick > 0 && this.playerTick && tick.lastPetDamageTick !== this.playerTick.lastPetDamageTick) {
                    this.emit('petDidDamage', tick);
                }
                if ((tick.weaponName && (!this.playerTick || tick.weaponName !== this.playerTick.weaponName)) || (tick.weaponTier && (!this.playerTick || tick.weaponTier !== this.playerTick.weaponTier))) {
                    this.playerWeaponName = tick.weaponName;
                    this.emit('equippedWeapon', tick.weaponName, tick.weaponTier);
                }
                if (tick.hatName && (!this.playerTick || tick.hatName !== this.playerTick.hatName)) {
                    this.playerHatName = tick.hatName;
                    this.emit('equippedHat', tick.hatName);
                }
                if (tick.petUid && (!this.playerTick || tick.petUid !== this.playerTick.petUid)) {
                    let petTick = {};
                    let petNetworkEntity = Game_1.default.currentGame.world.getEntityByUid(tick.petUid);
                    if (petNetworkEntity) {
                        const petTick_1 = petNetworkEntity.getTargetTick();
                        this.playerPetUid = tick.petUid;
                        this.playerPetName = petTick_1.model;
                        this.emit('equippedPet', this.playerPetName, petTick_1.tier);
                    } else {
                        tick.petUid = null;
                    }
                }
                if (this.playerPetUid) {
                    let petNetworkEntity = Game_1.default.currentGame.world.getEntityByUid(this.playerPetUid);
                    if (petNetworkEntity) {
                        let petTick_2 = petNetworkEntity.getTargetTick();
                        if (petTick_2.woodGainTick > 0 && this.playerPetTick && petTick_2.woodGainTick !== this.playerPetTick.woodGainTick) {
                            this.emit('petGainedWood', petTick_2);
                        }
                        if (petTick_2.stoneGainTick > 0 && this.playerPetTick && petTick_2.stoneGainTick !== this.playerPetTick.stoneGainTick) {
                            this.emit('petGainedStone', petTick_2);
                        }
                        this.playerPetTick = petTick_2;
                        this.emit('playerPetTickUpdate', this.playerPetTick);
                    }
                }
                this.playerTick = tick;
                this.isWavePaused = this.playerTick.isPaused === 1;
                this.emit('playerTickUpdate', this.playerTick);
            };
            getComponent(name) {
                return this.components[name];
            };
            addComponent(name, component, anchor = null) {
                switch (anchor) {
                    case UiAnchor.TOP_LEFT:
                        this.uiTopLeftElem.appendChild(component.getComponentElem());
                        break;
                    case UiAnchor.TOP_CENTER:
                        this.uiTopCenterElem.appendChild(component.getComponentElem());
                        break;
                    case UiAnchor.TOP_RIGHT:
                        this.uiTopRightElem.appendChild(component.getComponentElem());
                        break;
                    case UiAnchor.BOTTOM_LEFT:
                        this.uiBottomLeftElem.appendChild(component.getComponentElem());
                        break;
                    case UiAnchor.BOTTOM_CENTER:
                        this.uiBottomCenterElem.appendChild(component.getComponentElem());
                        break;
                    case UiAnchor.BOTTOM_RIGHT:
                        this.uiBottomRightElem.appendChild(component.getComponentElem());
                        break;
                    case UiAnchor.CENTER_LEFT:
                        this.uiCenterLeftElem.appendChild(component.getComponentElem());
                        break;
                    case UiAnchor.CENTER_RIGHT:
                        this.uiCenterRightElem.appendChild(component.getComponentElem());
                        break;
                    default:
                        this.uiElem.appendChild(component.getComponentElem());
                        break;
                }
                this.components[name] = component;
            };
            createElement(html) {
                let wrapperDiv = document.createElement('div');
                wrapperDiv.innerHTML = html;
                return wrapperDiv.firstChild;
            };
            onMouseDown(event) {
                const placementOverlay = this.components.PlacementOverlay;
                this.isMouseDown = true;
                if (this.components.Intro.isVisible() || this.components.Reconnect.isVisible() || this.components.Respawn.isVisible()) return;
                placementOverlay.isActive() && placementOverlay.placeBuilding();
            };
            onMouseUp(event) {
                let buildingOverlay = this.components.BuildingOverlay;
                let placementOverlay = this.components.PlacementOverlay;
                let spellOverlay = this.components.SpellOverlay;
                let menuShop = this.components.MenuShop;
                let menuParty = this.components.MenuParty;
                let menuSettings = this.components.MenuSettings;
                let menuFPS = this.components.MenuFPS;
                let menuScripts = this.components.MenuScripts;
                this.isMouseDown = false;
                if (this.components.Intro.isVisible() || this.components.Reconnect.isVisible() || this.components.Respawn.isVisible()) return;
                if (placementOverlay.isActive()) {
                    return;
                }
                menuShop.hide();
                menuParty.hide();
                if (spellOverlay.isActive()) {
                    spellOverlay.castSpell();
                    return;
                }
                //if (this.playerWeaponName !== 'Pickaxe') {
                    //buildingOverlay.stopWatching();
                    //return;
                //}
                const world = Game_1.default.currentGame.world;
                const worldPos = Game_1.default.currentGame.renderer.screenToWorld(this.mousePosition.x, this.mousePosition.y);
                const cellIndexes = world.entityGrid.getCellIndexes(worldPos.x, worldPos.y, { width: 1, height: 1 });
                const cellIndex = cellIndexes.length > 0 ? cellIndexes[0] : false;
                if (cellIndex === false) return;
                let entities = world.entityGrid.getEntitiesInCell(cellIndex);
                let shouldStopWatching = false;
                entities.forEach((e, uid) => {
                    let entity = world.getEntityByUid(parseInt(uid));
                    let entityTick = entity.getTargetTick();
                    //if (buildingOverlay && entityUid == buildingOverlay.getBuildingUid()) {
                        //buildingOverlay.stopWatching();
                        //return;
                    //}
                    if (this.buildingSchema[entityTick.model]) {
                        buildingOverlay.stopWatching();
                        buildingOverlay.startWatching(entityTick.uid);
                        shouldStopWatching = true;
                    }
                })
                !shouldStopWatching && buildingOverlay.stopWatching();
            };
            onMouseRightUp(event) {
                this.components.BuildingOverlay.stopWatching();
                this.components.PlacementOverlay.cancelPlacing();
                this.components.SpellOverlay.cancelCasting();
            };
            onMouseMoved(event) {
                this.mousePosition = { x: event.clientX, y: event.clientY };
                this.components.PlacementOverlay.update();
                this.components.SpellOverlay.update();
            };
            onMouseMovedWhileDown(event) {
                const placementOverlay = this.components.PlacementOverlay;
                this.mousePosition = { x: event.clientX, y: event.clientY };
                placementOverlay.update();
                placementOverlay.placeBuilding();
            };
            onKeyPress(event) {
                const activeTag = document.activeElement.tagName.toLowerCase();
                const movementKeys = [87, 83, 65, 68, 37, 38, 39, 40];
                if (activeTag == 'input' || activeTag == 'textarea') return;
                if (event.keyCode === 16) {
                    this.components.BuildingOverlay.setShouldUpgradeAll(true);
                    return;
                }
                if (movementKeys.indexOf(event.keyCode) > -1 && this.isMouseDown) {
                    this.components.PlacementOverlay.placeBuilding();
                    return;
                }
                if (event.keyCode === 81) {
                    this.cycleWeapon();
                    return;
                }
            };
            onKeyRelease(event) {
                let keyCode = event.keyCode;
                const activeTag = document.activeElement.tagName.toLowerCase();
                let chatComponent = this.components.Chat;
                let buildingOverlay = this.components.BuildingOverlay;
                let placementOverlay = this.components.PlacementOverlay;
                let spellOverlay = this.components.SpellOverlay;
                let menuShop = this.components.MenuShop;
                let menuParty = this.components.MenuParty;
                let menuSettings = this.components.MenuSettings;
                let menuFPS = this.components.MenuFPS;
                let menuScripts = this.components.MenuScripts;
                if (activeTag == 'input' || activeTag == 'textarea') return;
                if (this.components.Intro.isVisible() || this.components.Reconnect.isVisible() || this.components.Respawn.isVisible()) return;
                if (keyCode === 27) {
                    buildingOverlay.stopWatching();
                    placementOverlay.cancelPlacing();
                    spellOverlay.cancelCasting();
                    menuShop.hide();
                    menuParty.hide();
                    menuSettings.hide();
                    menuFPS.hide();
                    menuScripts.hide();
                    return;
                }
                if (keyCode === 13) {
                    buildingOverlay.stopWatching();
                    placementOverlay.cancelPlacing();
                    spellOverlay.cancelCasting();
                    chatComponent.startTyping();
                    return;
                }
                if (keyCode === 16) {
                    buildingOverlay.setShouldUpgradeAll(false);
                    return;
                }
                if (keyCode === 82) {
                    placementOverlay.cycleDirection();
                    return;
                }
                if (keyCode === 69) {
                    buildingOverlay.upgradeBuilding();
                    return;
                }
                if (keyCode === 84) {
                    buildingOverlay.sellBuilding();
                    return;
                }
                if (keyCode === 70) {
                    this.useHealthPotion();
                    return;
                }
                if (keyCode === 80) {
                    buildingOverlay.stopWatching();
                    placementOverlay.cancelPlacing();
                    spellOverlay.cancelCasting();
                    menuShop.hide();
                    menuSettings.hide();
                    menuFPS.hide();
                    menuScripts.hide();
                    if (menuParty.isVisible()) {
                        menuParty.hide();
                    } else {
                        menuParty.show();
                    }
                    return;
                }
                if (keyCode === 66 || keyCode == 79) {
                    buildingOverlay.stopWatching();
                    placementOverlay.cancelPlacing();
                    spellOverlay.cancelCasting();
                    menuParty.hide();
                    menuSettings.hide();
                    menuFPS.hide();
                    menuScripts.hide();
                    if (menuShop.isVisible()) {
                        menuShop.hide();
                    } else {
                        menuShop.show();
                    }
                    return;
                }
                for (const buildingId in this.buildingSchema) {
                    const schemaData = this.buildingSchema[buildingId];
                    if (!schemaData.key) {
                        continue;
                    }
                    if (keyCode === schemaData.key.charCodeAt(0)) {
                        buildingOverlay.stopWatching();
                        spellOverlay.cancelCasting();
                        placementOverlay.startPlacing(buildingId);
                        return;
                    }
                }
            };
            onConnectionOpen(event) {
                this.components.Reconnect.hide();
            };
            onConnectionClose(event) {
                document.useRequiredEquipment = false;
                this.components.Reconnect.show();
            };
            onEnterWorld(data) {
                if (!data.allowed) return;
                delete this.playerTick;
                delete this.playerWeaponName;
                delete this.playerHatName;
                delete this.playerPetUid;
                delete this.playerPetName;
                delete this.playerPetTick;
                delete this.playerPartyId;
                delete this.playerPartyMembers;
                delete this.playerPartyShareKey;
                delete this.playerPartyLeader;
                const buildingUpdates = [];
                Object.values(this.buildings).forEach(e => {
                    buildingUpdates.push({x: e.x, y: e.y, type: e.type, tier: e.tier, uid: e.uid, dead: 1});
                })
                this.onLocalBuildingUpdate(buildingUpdates);
                for (const itemId in this.inventory) {
                    this.onLocalItemUpdate({itemName: itemId, tier: this.inventory[itemId].tier, stacks: 0});
                }
                this.parties = {};
                this.emit('partiesUpdate', this.parties);
                this.components.Respawn.hide();
            };
            onServerShuttingDown(response) {
                this.components.AnnouncementOverlay.showAnnouncement('<span class="hud-announcement-shutdown">This server will restart in 10 seconds with brand new game updates. Brace for impact...</span>');
            };
            onLocalBuildingUpdate(response) {
                let walkthrough = this.components.Walkthrough;
                response.forEach(e => {
                    if (this.buildingUids_1[e.uid]) return;
                    if (e.dead && !this.buildingUids_1[e.uid]) {
                        let uid_ = e.uid;
                        this.buildingUids_1[uid_] = 1;
                        setTimeout(() => {
                            delete this.buildingUids_1[uid_];
                        }, 500)
                    }
                    if (e.dead) {
                        delete this.buildings[e.uid];
                    } else {
                        this.buildings[e.uid] = e;
                    }
                    if (e.type == 'GoldStash') {
                        if (e.dead) {
                            for (const buildingId in this.buildingSchema) {
                                this.buildingSchema[buildingId].disabled = true;
                            }
                            delete this.buildingSchema.GoldStash.disabled;
                        } else {
                            for (const buildingId in this.buildingSchema) {
                                delete this.buildingSchema[buildingId].disabled;
                            }
                            this.buildingSchema.GoldStash.disabled = true;
                            walkthrough.markStepAsCompleted(2);
                        }
                    } else if (e.type == 'ArrowTower' && !e.dead) {
                        walkthrough.markStepAsCompleted(3);
                    } else if (e.type == 'GoldMine' && !e.dead) {
                        walkthrough.markStepAsCompleted(4);
                    }
                })
                Object.values(this.buildingSchema).forEach(e => {
                    e.built = 0;
                })
                Object.values(this.buildings).forEach(e => {
                    this.buildingSchema[e.type].built += 1;
                })
                this.emit('buildingsUpdate', this.buildings);
            };
            onLocalItemUpdate(response) {
                if (response.stacks == 0) {
                    delete this.inventory[response.itemName];
                    this.emit('itemConsumed', response.itemName, response.tier);
                } else {
                    this.inventory[response.itemName] = response;
                    if (response.itemName == "ZombieShield") {
                        game.network.sendPacket(9, {name: "EquipItem", itemName: "ZombieShield", tier: response.tier})
                    }
                }
                this.emit('inventoryUpdate', this.inventory);
            };
            onBuildingSchemaUpdate(response) {
                const json = user.connectedToId ? response.json : JSON.parse(response.json);
                for (const i in json) {
                    const entityData = json[i];
                    for (const buildingId in this.buildingSchema) {
                        if (buildingId == entityData.Name) {
                            this.buildingSchema[buildingId].tiers = entityData.GoldCosts.length;
                            this.buildingSchema[buildingId].woodCosts = entityData.WoodCosts;
                            this.buildingSchema[buildingId].stoneCosts = entityData.StoneCosts;
                            this.buildingSchema[buildingId].goldCosts = entityData.GoldCosts;
                            this.buildingSchema[buildingId].healthTiers = entityData.Health;
                            if (entityData.TowerRadius) {
                                this.buildingSchema[buildingId].rangeTiers = entityData.TowerRadius;
                            }
                            if (entityData.GoldPerSecond) {
                                this.buildingSchema[buildingId].gpsTiers = entityData.GoldPerSecond;
                            }
                            if (entityData.DamageToZombies) {
                                this.buildingSchema[buildingId].damageTiers = entityData.DamageToZombies;
                            }
                            if (entityData.HarvestAmount) {
                                this.buildingSchema[buildingId].harvestTiers = [];
                                for (const i_1 in entityData.HarvestAmount) {
                                    this.buildingSchema[buildingId].harvestTiers.push(Math.round(entityData.HarvestAmount[i_1] * (1000 / entityData.HarvestCooldown[i_1]) * 100) / 100);
                                }
                            }
                            if (entityData.HarvestMax) {
                                this.buildingSchema[buildingId].harvestCapacityTiers = entityData.HarvestMax;
                            }
                            if (!entityData.Projectiles) break;
                            const projectileData = entityData.Projectiles[0];
                            projectileData.DamageToZombies && (this.buildingSchema[buildingId].damageTiers = projectileData.DamageToZombies);
                            break;
                        }
                    }
                }
                this.emit('buildingSchemaUpdate', this.buildingSchema);
            };
            onItemSchemaUpdate(response) {
                const json = user.connectedToId ? response.json : JSON.parse(response.json);
                for (const i in json) {
                    const entityData = json[i];
                    for (const itemId in this.itemSchema) {
                        if (itemId == entityData.Name) {
                            this.itemSchema[itemId].tiers = entityData.GoldCosts.length;
                            this.itemSchema[itemId].goldCosts = entityData.GoldCosts;
                            this.itemSchema[itemId].tokenCosts = entityData.TokenCosts;
                            if (entityData.DamageToZombies) {
                                this.itemSchema[itemId].damageTiers = entityData.DamageToZombies;
                            } else if (entityData.Damage) {
                                this.itemSchema[itemId].damageTiers = entityData.Damage;
                            }
                            if (entityData.IsTool) {
                                this.itemSchema[itemId].harvestTiers = entityData.HarvestCount;
                            } else if (entityData.Range) {
                                this.itemSchema[itemId].rangeTiers = entityData.Range;
                            } else if (entityData.ProjectileMaxRange) {
                                this.itemSchema[itemId].rangeTiers = entityData.ProjectileMaxRange;
                            }
                            if (itemId == 'ZombieShield') {
                                this.itemSchema[itemId].healthTiers = entityData.Health;
                                this.itemSchema[itemId].rechargeTiers = entityData.MsBeforeRecharge.map((a) => ((a / 1000) + 's'));
                            }
                            if (entityData.MsBetweenFires) {
                                this.itemSchema[itemId].attackSpeedTiers = entityData.MsBetweenFires.map((a) => (Math.round(1000 / a * 100) / 100));
                            }
                            if (entityData.PurchaseCooldown) {
                                this.itemSchema[itemId].purchaseCooldown = entityData.PurchaseCooldown;
                            }
                            break;
                        }
                    }
                }
                this.emit('itemSchemaUpdate', this.itemSchema);
            };
            onSpellSchemaUpdate(response) {
                const json = user.connectedToId ? response.json : JSON.parse(response.json);
                for (const i in json) {
                    const spellData = json[i];
                    for (const spellId in this.spellSchema) {
                        if (spellId == spellData.Name) {
                            this.spellSchema[spellId].tiers = spellData.Cooldown.length;
                            this.spellSchema[spellId].cooldownTiers = spellData.Cooldown;
                            this.spellSchema[spellId].goldCosts = spellData.GoldCosts;
                            this.spellSchema[spellId].tokenCosts = spellData.TokenCosts;
                            if (spellData.VisualRadius) {
                                this.spellSchema[spellId].rangeTiers = [];
                                for (let i_2 = 0; i_2 < this.spellSchema[spellId].tiers; i_2++) {
                                    this.spellSchema[spellId].rangeTiers.push(spellData.VisualRadius);
                                }
                            }
                            break;
                        }
                    }
                }
                this.emit('spellSchemaUpdate', this.spellSchema);
            };
            onPartyInfoUpdate(response) {
                let partySize = response.length;
                let buildingRawSchema = JSON.parse(JSON.stringify(__webpack_require__(317)));
                this.playerPartyMembers = response;
                this.playerPartyLeader = false;
                this.playerPartyCanSell = true;
                for (const i in this.playerPartyMembers) {
                    if (Game_1.default.currentGame.world.getMyUid() === this.playerPartyMembers[i].playerUid) {
                        this.playerPartyLeader = this.playerPartyMembers[i].isLeader === 1;
                        this.playerPartyCanSell = this.playerPartyMembers[i].canSell === 1;
                        break;
                    }
                }
                this.emit('partyMembersUpdated', response);
                for (const buildingId in this.buildingSchema) {
                    if (['Wall', 'Door', 'SlowTrap', 'ArrowTower', 'CannonTower', 'MeleeTower', 'BombTower', 'MagicTower', 'Harvester'].indexOf(buildingId) === -1) {
                        continue;
                    }
                    this.buildingSchema[buildingId].limit = buildingRawSchema[buildingId].limit * response.length;
                }
                this.emit('buildingSchemaUpdate', this.buildingSchema);
            };
            onPartyShareKeyUpdate(response) {
                this.playerPartyShareKey = response.partyShareKey;
                this.emit('partyMembersUpdated', this.playerPartyMembers);
            };
            onAddParty(response) {
                this.parties[response.partyId] = response;
                this.emit('partiesUpdated', this.parties);
            };
            onRemoveParty(response) {
                delete this.parties[response.partyId];
                this.emit('partiesUpdated', this.parties);
            };
            onSetPartyList(response) {
                this.parties = {};
                for (let i = 0; i < response.length; i++) {
                    this.parties[response[i].partyId] = response[i];
                }
                this.emit('partiesUpdated', this.parties);
            };
            onGenericFailure(response) {
                if (window.disablepopups) return;
                let popupOverlay = this.components.PopupOverlay;
                if (response.category == 'Placement' && response.x !== 2 ** 32 - 9 && response.y !== 2 ** 32 - 9) {
                    if (response.reason == 'TooFarFromLocalPosition') {
                        popupOverlay.showHint('You can\'t place buildings that far away from your position.', 4000);
                    } else if (response.reason == 'TooFarFromStash') {
                        popupOverlay.showHint('You can\'t place buildings that far from your Gold Stash.', 4000);
                    } else if (response.reason == 'TooCloseToEdge') {
                        popupOverlay.showHint('You can\'t place buildings that close to the edge of the map.', 4000);
                    } else if (response.reason == 'BuildingLimit') {
                        popupOverlay.showHint('You can\'t place any more of this type of tower.', 4000);
                    } else if (response.reason == 'TooCloseToEnemyStash') {
                        popupOverlay.showHint('You can\'t place your Gold Stash too close to other enemy bases.', 4000);
                    } else if (response.reason == 'ObstructionsArePresent' || response.reason == 'PartyBuildingObstructionsArePresent') {
                        popupOverlay.showHint('You can\'t place buildings in occupied cells.', 4000);
                    } else if (response.reason == 'NotEnoughMinerals') {
                        popupOverlay.showHint('You don\'t have enough resources to place this building.', 4000);
                    } else if (response.reason == 'TooCloseToEnemyBuilding') {
                        popupOverlay.showHint('You can\'t place a Harvester too close to enemy bases.', 4000);
                    } else if (response.reason == 'OutsideOfWorld') {
                        popupOverlay.showHint('You can\'t place buildings outside of the map.', 4000);                       
                    }
                    return;
                }
            };
            onPlayerDeath() {
                this.components.BuildingOverlay.stopWatching();
                this.components.PlacementOverlay.cancelPlacing();
                this.components.SpellOverlay.cancelCasting();
                this.components.MenuShop.hide();
                this.components.MenuParty.hide();
                this.components.MenuFPS.hide();
            };
            onItemEquippedOrUsed(itemId, itemTier) {
                if (this.itemSchema[itemId].type !== 'Weapon') return;
                this.components.BuildingOverlay.stopWatching();
                this.components.PlacementOverlay.cancelPlacing();
                this.components.SpellOverlay.cancelCasting();
                this.components.MenuShop.hide();
                this.components.MenuParty.hide();
            };
            useHealthPotion() {
                if (!this.inventory.HealthPotion || this.inventory.HealthPotion.stacks === 0) return;
                this.emit('shouldEquipItem', 'HealthPotion', 1);
            };
            cycleWeapon() {
                !window.thisWeapon && (window.thisWeapon = 'Pickaxe');
                let nextWeapon = 'Pickaxe';
                let weaponOrder = ['Pickaxe', 'Spear', 'Bow', 'Bomb'];
                let foundCurrent = false;
                for (const i in weaponOrder) {
                    if (foundCurrent) {
                        if (this.inventory[weaponOrder[i]]) {
                            nextWeapon = weaponOrder[i];
                            break;
                        }
                    } else if (weaponOrder[i] == window.thisWeapon) {
                        foundCurrent = true;
                    }
                }
                game.network.sendPacket(9, {name: 'EquipItem', itemName: nextWeapon, tier: this.inventory[nextWeapon].tier});
                window.thisWeapon = nextWeapon;
            };
            onDragOver(event) {
                event.preventDefault();
            };
            onBeforeUnload(event) {
                if (!Game_1.default.currentGame.world.getInWorld() || !this.playerTick || this.playerTick.dead === 1) return;
                event.returnValue = 'Leaving the page will cause you to lose all progress. Are you sure?';
                return event.returnValue;
            };
        }
        exports.default = Ui;
        /***/ }),
    /* 271 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiAnnouncementOverlay');
        class UiAnnouncementOverlay extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-announcement-overlay\" class=\"hud-announcement-overlay\"></div>");
            }
            showAnnouncement(message) {
                let announcementElem = this.ui.createElement("<div class=\"hud-announcement-message\">" + message + "</div>");
                this.componentElem.appendChild(announcementElem);
                setTimeout(() => {
                    announcementElem.remove();
                }, 8000);
            };
        }
        exports.default = UiAnnouncementOverlay;
        /***/ }),
    /* 272 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let events = __webpack_require__(250);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiComponent');
        class UiComponent extends events.EventEmitter {
            constructor(ui, template) {
                super();
                this.ui = ui;
                this.componentElem = this.ui.createElement(template);
            }
            getComponentElem() {
                return this.componentElem;
            }
            show() {
                this.componentElem.style.display = 'block';
            }
            hide() {
                this.componentElem.style.display = 'none';
            }
            isVisible() {
                return window.getComputedStyle(this.componentElem).display !== 'none';
            };
        }
        exports.default = UiComponent;
        /***/ }),
    /* 273 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let Util_1 = __webpack_require__(213);
        let UiComponent_1 = __webpack_require__(272);
        let RangeIndicatorModel_1 = __webpack_require__(237);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiBuildingOverlay');
        class UiBuildingOverlay extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-building-overlay\" class=\"hud-building-overlay hud-tooltip hud-tooltip-top\"></div>");
                this.shouldUpgradeAll = false;
                this.maxStashDistance = 18;
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                Game_1.default.currentGame.renderer.addTickCallback(this.onTick.bind(this));
                Game_1.default.currentGame.renderer.on('cameraUpdate', this.onCameraUpdate.bind(this));
                this.ui.on('buildingsUpdate', this.onBuildingsUpdate.bind(this));
                this.ui.on('buildingSchemaUpdate', this.onBuildingSchemaUpdate.bind(this));
            }
            isActive() {
                return !!this.buildingUid;
            };
            getBuildingUid() {
                return this.buildingUid;
            };
            getShouldUpgradeAll() {
                return this.shouldUpgradeAll;
            };
            setShouldUpgradeAll(shouldUpgradeAll) {
                this.shouldUpgradeAll = shouldUpgradeAll;
                this.update();
            };
            update() {
                if (!this.buildingUid) return;
                let networkEntity = Game_1.default.currentGame.world.getEntityByUid(this.buildingUid);
                if (!networkEntity) {
                    this.stopWatching();
                    return;
                }
                const renderer = Game_1.default.currentGame.renderer;
                const screenPos = renderer.worldToScreen(networkEntity.getPositionX(), networkEntity.getPositionY());
                const entityTick = networkEntity.getTargetTick();
                const buildingSchema = this.ui.getBuildingSchema();
                const buildings = this.ui.getBuildings();
                const schemaData = buildingSchema[this.buildingId];
                const buildingData = buildings[this.buildingUid];
                if (!buildingData) {
                    this.stopWatching();
                    return;
                }
                const gridHeight = schemaData.gridHeight;
                const gridWidth = buildingSchema.gridWidth;
                const entityHeight = gridHeight / 2 * 48 * (renderer.getScale() / window.devicePixelRatio);
                const currentTier = buildingData.tier;
                let nextTier = 1;
                let maxTier = false;
                let canUpgrade = false;
                const currentStats = {};
                const nextStats = {};
                const buildingsArr = Object.values(buildings);
                let buildingsToUpgrade = 1;
                const statMap = {
                    health: 'Health',
                    damage: 'Damage',
                    range: 'Range',
                    gps: 'Gold/Sec',
                    harvest: 'Harvest/Sec',
                    harvestCapacity: 'Capacity'
                };
                if (this.shouldUpgradeAll) {
                    buildingsToUpgrade = 0;
                    buildingsArr.forEach(e => {
                        if (e.type == this.buildingId && e.tier == buildingData.tier) {
                            buildingsToUpgrade++;
                        }
                    })
                }
                if (schemaData.tiers) {
                    const stashTier = buildingsArr[0].tier;
                    if (buildingData.tier < schemaData.tiers) {
                        nextTier = buildingData.tier + 1;
                        maxTier = false;
                    } else {
                        nextTier = buildingData.tier;
                        maxTier = true;
                    }
                    if (!maxTier && (buildingData.tier < stashTier || this.buildingId === 'GoldStash')) {
                        canUpgrade = true;
                    } else {
                        canUpgrade = false;
                    }
                }
                for (const key in statMap) {
                    let current = "<small>&mdash;</small>";
                    let next = "<small>&mdash;</small>";
                    if (!schemaData[key + 'Tiers']) {
                        continue;
                    }
                    current = schemaData[key + 'Tiers'][currentTier - 1].toLocaleString();
                    if (!maxTier) {
                        next = schemaData[key + 'Tiers'][nextTier - 1].toLocaleString();
                    }
                    currentStats[key] = "<p>" + statMap[key] + ": <strong class=\"hud-stats-current\">" + current + "</strong></p>";
                    nextStats[key] = "<p>" + statMap[key] + ": <strong class=\"hud-stats-next\">" + next + "</strong></p>";
                }
                const costsHtml = Util_1.default.createResourceCostString(schemaData, nextTier, buildingsToUpgrade);
                const refundsHtml = Util_1.default.createResourceRefundString(schemaData, buildingData.tier, buildingsToUpgrade);
                const healthPercentage = Math.round(entityTick.health / entityTick.maxHealth * 100);
                if (entityTick.partyId !== this.ui.getPlayerPartyId()) {
                    this.actionsElem.style.display = 'none';
                } else {
                    this.actionsElem.style.display = 'block';
                }
                this.tierElem.innerHTML = buildingData.tier.toString();
                this.buildingTier = buildingData.tier;
                this.healthBarElem.style.width = healthPercentage + '%';
                if (Object.keys(currentStats).length > 0) {
                    let currentStatsHtml = "";
                    let nextStatsHtml = "";
                    for (let i in currentStats) {
                        currentStatsHtml += currentStats[i];
                    }
                    for (let i in nextStats) {
                        nextStatsHtml += nextStats[i];
                    }
                    this.statsElem.innerHTML = "\n                <div class=\"hud-stats-current hud-stats-values\">\n                    " + currentStatsHtml + "\n                </div>\n                <div class=\"hud-stats-next hud-stats-values\">\n                    " + nextStatsHtml + "\n                </div>\n            ";
                } else {
                    this.statsElem.innerHTML = "";
                }
                if (this.buildingId === 'Harvester') {
                    const depositCost = Math.floor(entityTick.depositMax / 10);
                    const isAlmostFull = entityTick.depositMax - entityTick.deposit < depositCost;
                    if (isAlmostFull) {
                        this.depositElem.classList.add('is-disabled');
                    } else {
                        this.depositElem.classList.remove('is-disabled');
                    }
                    if (this.shouldUpgradeAll) {
                        this.depositElem.innerHTML = "Refuel All <small>(" + (depositCost * buildingsToUpgrade).toLocaleString() + " gold)</small>";
                    } else {
                        this.depositElem.innerHTML = "Refuel <small>(" + depositCost.toLocaleString() + " gold)</small>";
                    }
                }
                if (canUpgrade) {
                    this.upgradeElem.classList.remove('is-disabled');
                } else {
                    this.upgradeElem.classList.add('is-disabled');
                }
                if (this.shouldUpgradeAll) {
                    this.upgradeElem.innerHTML = "Upgrade All <small>(" + costsHtml + ")</small>";
                } else {
                    this.upgradeElem.innerHTML = "Upgrade <small>(" + costsHtml + ")</small>";
                }
                if (this.buildingId == 'GoldStash') {
                    this.sellElem.classList.add('is-disabled');
                    this.sellElem.innerHTML = "Sell";
                } else if (!this.ui.getPlayerPartyCanSell()) {
                    this.sellElem.classList.add('is-disabled');
                    this.sellElem.innerHTML = "Need Permission to Sell";
                } else {
                    this.sellElem.classList.remove('is-disabled');
                    if (!this.shouldUpgradeAll) {
                        this.sellElem.innerHTML = "Sell <small>(" + refundsHtml + ")</small>";
                    } else {
                        this.sellElem.innerHTML = "Sell All <small>(" + refundsHtml + ")</small>";
                    }
                }
                this.componentElem.style.left = (screenPos.x - this.componentElem.offsetWidth / 2) + 'px';
                this.componentElem.style.top = (screenPos.y - entityHeight - this.componentElem.offsetHeight - 20) + 'px';
                if (this.rangeIndicator) {
                    this.rangeIndicator.setPosition(networkEntity.getPositionX(), networkEntity.getPositionY());
                }
            };
            startWatching(buildingUid) {
                if (this.buildingUid) {
                    this.stopWatching();
                }
                const buildings = this.ui.getBuildings();
                const buildingData = buildings[buildingUid];
                if (!buildingData) return;
                this.buildingUid = buildingUid;
                this.buildingId = buildingData.type;
                this.buildingTier = buildingData.tier;
                const buildingSchema = this.ui.getBuildingSchema();
                const schemaData = buildingSchema[this.buildingId];
                if (this.buildingId == 'GoldStash') {
                    const cellSize = Game_1.default.currentGame.world.entityGrid.getCellSize();
                    this.rangeIndicator = new RangeIndicatorModel_1.default({width: this.maxStashDistance * cellSize * 2, height: this.maxStashDistance * cellSize * 2});
                    Game_1.default.currentGame.renderer.ground.addAttachment(this.rangeIndicator);
                } else if (schemaData.rangeTiers) {
                    this.rangeIndicator = new RangeIndicatorModel_1.default({isCircular: true, radius: schemaData.rangeTiers[this.buildingTier - 1]});
                    Game_1.default.currentGame.renderer.ground.addAttachment(this.rangeIndicator);
                }
                this.componentElem.innerHTML = "<div class=\"hud-tooltip-building\">\n            <h2>" + schemaData.name + "</h2>\n            <h3>Tier <span class=\"hud-building-tier\">" + this.buildingTier + "</span> Building</h3>\n            <div class=\"hud-tooltip-health\">\n                <span class=\"hud-tooltip-health-bar\" style=\"width:100%;\"></span>\n            </div>\n            <div class=\"hud-tooltip-body\">\n                <div class=\"hud-building-stats\"></div>\n                <p class=\"hud-building-actions\">\n                    <span class=\"hud-building-dual-btn\">\n                        <a class=\"btn btn-purple hud-building-deposit\">Refuel</a>\n                        <a class=\"btn btn-gold hud-building-collect\">Collect</a>\n                    </span>\n                    <a class=\"btn btn-green hud-building-upgrade\">Upgrade</a>\n                    <a class=\"btn btn-red hud-building-sell\">Sell</a>\n                </p>\n            </div>\n        </div>";
                this.tierElem = this.componentElem.querySelector('.hud-building-tier');
                this.healthBarElem = this.componentElem.querySelector('.hud-tooltip-health-bar');
                this.statsElem = this.componentElem.querySelector('.hud-building-stats');
                this.actionsElem = this.componentElem.querySelector('.hud-building-actions');
                this.depositElem = this.componentElem.querySelector('.hud-building-deposit');
                this.dualBtnElem = this.componentElem.querySelector('.hud-building-dual-btn');
                this.collectElem = this.componentElem.querySelector('.hud-building-collect');
                this.upgradeElem = this.componentElem.querySelector('.hud-building-upgrade');
                this.sellElem = this.componentElem.querySelector('.hud-building-sell');
                if (this.buildingId !== 'Harvester') {
                    this.dualBtnElem.style.display = 'none';
                }
                this.depositElem.addEventListener('click', this.depositIntoBuilding.bind(this));
                this.collectElem.addEventListener('click', this.collectFromBuilding.bind(this));
                this.upgradeElem.addEventListener('click', this.upgradeBuilding.bind(this));
                this.sellElem.addEventListener('click', this.sellBuilding.bind(this));
                this.show();
                this.update();
            };
            stopWatching() {
                if (!this.buildingUid) return;
                if (this.rangeIndicator) {
                    Game_1.default.currentGame.renderer.ground.removeAttachment(this.rangeIndicator);
                    delete this.rangeIndicator;
                }
                this.componentElem.innerHTML = "";
                this.componentElem.style.left = '-1000px';
                this.componentElem.style.top = '-1000px';
                this.buildingUid = null;
                this.buildingId = null;
                this.buildingTier = null;
                this.hide();
            };
            depositIntoBuilding() {
                if (!this.buildingId) return;
                const depositCost = Math.floor(Game_1.default.currentGame.world.getEntityByUid(this.buildingUid).getTargetTick().depositMax / 10);
                if (this.shouldUpgradeAll) {
                    Object.values(this.ui.buildings).forEach(e => {
                        if (e.type == this.buildingId) {
                            Game_1.default.currentGame.network.sendRpc({name: 'AddDepositToHarvester', uid: e.uid, deposit: depositCost});
                        }
                    })
                    return;
                }
                Game_1.default.currentGame.network.sendRpc({name: 'AddDepositToHarvester', uid: this.buildingUid, deposit: depositCost});
            };
            collectFromBuilding() {
                if (!this.buildingId) return;
                Game_1.default.currentGame.network.sendRpc({name: 'CollectHarvester', uid: this.buildingUid});
            };
            upgradeBuilding() {
                if (!this.buildingUid) return;
                if (this.shouldUpgradeAll) {
                    Object.values(this.ui.buildings).forEach(e => {
                        if (e.type == this.buildingId && e.tier == this.buildingTier) {
                            Game_1.default.currentGame.network.sendRpc({name: "UpgradeBuilding", uid: e.uid});
                        }
                    });
                    return;
                }
                Game_1.default.currentGame.network.sendRpc({name: 'UpgradeBuilding', uid: this.buildingUid});
            };
            sellBuilding() {
                if (!this.buildingUid) return;
                if (!this.isSold) this.isSold = {};
                if (!this.isSold[this.buildingUid]) {this.isSold[this.buildingUid] = {uid: this.buildingUid, sold: false}};
                if (this.buildingId == 'GoldStash') return;
                if (!this.shouldUpgradeAll) {
                    if (this.isSold[this.buildingUid].sold && this.isSold[this.buildingUid].uid == this.buildingUid) return;
                    Game_1.default.currentGame.network.sendRpc({name: 'DeleteBuilding', uid: this.buildingUid});
                    this.isSold[this.buildingUid] = {uid: this.buildingUid, sold: true};
                    setTimeout(() => {
                        this.isSold = {};
                    }, 750)
                } else {
                    Object.values(this.ui.buildings).forEach(e => {
                        if (e.type == this.buildingId && e.tier == this.buildingTier) {
                            Game_1.default.currentGame.network.sendRpc({name: 'DeleteBuilding', uid: e.uid});
                        }
                    })
                }
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
            onTick() {
                if (!this.buildingUid) return;
                const networkEntity = Game_1.default.currentGame.world.getEntityByUid(this.buildingUid);
                if (!networkEntity) {
                    this.stopWatching();
                    return;
                }
                const entityTick = networkEntity.getTargetTick();
                const healthPercentage = Math.round(entityTick.health / entityTick.maxHealth * 100);
                if (this.healthBarElem) {
                    this.healthBarElem.style.width = healthPercentage + '%';
                }
                if (this.depositElem && this.buildingId === 'Harvester') {
                    if (entityTick.depositMax - entityTick.deposit < entityTick.depositMax / 10) {
                        this.depositElem.classList.add('is-disabled');
                    } else {
                        this.depositElem.classList.remove('is-disabled');
                    }
                }
            };
            onCameraUpdate() {
                this.update();
            };
            onBuildingsUpdate() {
                this.update();
            };
            onBuildingSchemaUpdate() {
                this.update();
            };
        }
        exports.default = UiBuildingOverlay;
        /***/ }),
    /* 274 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiTooltip_1 = __webpack_require__(275);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiBuffBar');
        class UiBuffBar extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-buff-bar\" class=\"hud-buff-bar\"></div>");
                this.buffElems = {};
                this.ui.on('inventoryUpdate', this.onInventoryUpdate.bind(this));
                this.ui.on('itemSchemaUpdate', this.onItemSchemaUpdate.bind(this));
            }
            update() {
                const inventory = this.ui.getInventory();
                const itemSchema = this.ui.getItemSchema();
                for (const itemId in this.buffElems) {
                    if (inventory[itemId] && inventory[itemId].stacks > 0) {
                        if (this.buffElems[itemId] && itemSchema[itemId].tiers > 1) {
                            this.buffElems[itemId].setAttribute('data-tier', inventory[itemId].tier.toString());
                        }
                        continue;
                    }
                    this.buffElems[itemId].remove();
                    delete this.buffElems[itemId];
                }
                for (const itemId in inventory) {
                    this._loop_1(itemId, inventory, itemSchema);
                }
            };
            _loop_1(itemId, inventory, itemSchema) {
                const inventoryData = inventory[itemId];
                const schemaData = itemSchema[itemId];
                if (inventoryData.stacks === 0 || !schemaData || !schemaData.onBuffBar || this.buffElems[itemId]) {
                    return "continue";
                }
                let buffElem = this.ui.createElement("<div class=\"hud-buff-bar-item\" data-item=\"" + itemId + "\"></div>");
                if (schemaData.tiers > 1) {
                    buffElem.setAttribute('data-tier', inventoryData.tier.toString());
                }
                this.componentElem.appendChild(buffElem);
                new UiTooltip_1.default(buffElem, () => {
                    let itemTier = inventory[itemId].tier.toString();
                    return "\n                <div class=\"hud-tooltip-toolbar\">\n                    <h2>" + itemSchema[itemId].name + "</h2>\n                    <h3>Tier " + itemTier + " Item</h3>\n                    <div class=\"hud-tooltip-body\">\n                        " + itemSchema[itemId].description + "\n                    </div>\n                </div>\n                ";
                });
                this.buffElems[itemId] = buffElem;
            };
            onInventoryUpdate() {
                this.update();
            };
            onItemSchemaUpdate() {
                this.update();
            };
        }
        exports.default = UiBuffBar;
        /***/ }),
    /* 275 */
    /***/ ((module, exports) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        class UiTooltip {
            constructor(targetElem, callback, anchor) {
                if (!anchor) anchor = 'top';
                this.anchor = 'top';
                this.targetElem = targetElem;
                this.callback = callback;
                this.anchor = anchor;
                this.bindInputEvents();
            }
            getTargetElem() {
                return this.targetElem;
            };
            setAnchor(anchor) {
                this.anchor = anchor;
            };
            hide() {
                if (!this.tooltipElem) return;
                this.tooltipElem.remove();
                delete this.tooltipElem;
            };
            bindInputEvents() {
                this.targetElem.addEventListener('mouseenter', (event) => {
                    let tooltipHtml = "\n            <div id=\"hud-tooltip\" class=\"hud-tooltip\">\n                " + this.callback(this.targetElem) + "\n            </div>\n            ";
                    document.body.insertAdjacentHTML('beforeend', tooltipHtml);
                    this.tooltipElem = document.getElementById('hud-tooltip');
                    let elementOffset = this.targetElem.getBoundingClientRect();
                    let tooltipOffset = { left: 0, top: 0 };
                    if (this.anchor == 'top') {
                        tooltipOffset.left = elementOffset.left + elementOffset.width / 2 - this.tooltipElem.offsetWidth / 2;
                        tooltipOffset.top = elementOffset.top - this.tooltipElem.offsetHeight - 20;
                    }
                    else if (this.anchor == 'bottom') {
                        tooltipOffset.left = elementOffset.left + elementOffset.width / 2 - this.tooltipElem.offsetWidth / 2;
                        tooltipOffset.top = elementOffset.top + elementOffset.height + 20;
                    }
                    else if (this.anchor == 'left') {
                        tooltipOffset.left = elementOffset.left - this.tooltipElem.offsetWidth - 20;
                        tooltipOffset.top = elementOffset.top + elementOffset.height / 2 - this.tooltipElem.offsetHeight / 2;
                    }
                    else if (this.anchor == 'right') {
                        tooltipOffset.left = elementOffset.left + elementOffset.width + 20;
                        tooltipOffset.top = elementOffset.top + elementOffset.height / 2 - this.tooltipElem.offsetHeight / 2;
                    }
                    this.tooltipElem.className = 'hud-tooltip hud-tooltip-' + this.anchor;
                    this.tooltipElem.style.left = tooltipOffset.left + 'px';
                    this.tooltipElem.style.top = tooltipOffset.top + 'px';
                });
                this.targetElem.addEventListener('mouseleave', (event) => {
                    this.hide();
                });
            };
        }
        exports.default = UiTooltip;
        /***/ }),
    /* 276 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiChat');
        const Sanitize = __webpack_require__(330).default;
        class UiChat extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-chat\" class=\"hud-chat\">\n            <input type=\"text\" name=\"message\" class=\"hud-chat-input\" placeholder=\"Enter your chat message...\" maxlength=\"249\">\n            <div class=\"hud-chat-messages\"></div>\n        </div>");
                this.messageInputElem = this.componentElem.querySelector('.hud-chat-input');
                this.messagesElem = this.componentElem.querySelector('.hud-chat-messages');
                this.messageInputElem.addEventListener('blur', this.onMessageInputBlur.bind(this));
                this.messageInputElem.addEventListener('keyup', this.onMessageKeyUp.bind(this));
                this.messagesElem.addEventListener('wheel', this.onChatMessagesWheel.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('ReceiveChatMessage', this.onMessageReceived.bind(this));
            }
            startTyping() {
                this.componentElem.classList.add('is-focused');
                this.messageInputElem.focus();
            };
            cancelTyping() {
                this.componentElem.classList.remove('is-focused');
                this.messageInputElem.blur();
            };
            sendMessage(message) {
                if (!message || message.trim().length === 0) {
                    setTimeout(() => {
                        this.cancelTyping();
                    }, 0);
                    return;
                }
                Game_1.default.currentGame.network.sendRpc({name: 'SendChatMessage', channel: 'Local', message: message});
                setTimeout(() => {
                    this.cancelTyping();
                }, 0);
            };
            onMessageInputBlur(event) {
                this.cancelTyping();
            };
            onChatMouseDown(event) {
                event.stopPropagation();
                if (event.target !== this.messageInputElem) {
                    this.startTyping();
                }
            };
            onChatMessagesWheel(event) {
                event.stopPropagation();
            };
            onMessageKeyUp(event) {
                let keyCode = event.keyCode;
                if (keyCode === 27) {
                    this.cancelTyping();
                    return;
                }
                if (keyCode === 13) {
                    this.sendMessage(this.messageInputElem.value);
                    this.messageInputElem.value = null;
                    return;
                }
            };
            onMessageReceived(response) {
                let displayName = Sanitize(response.displayName);
                let message = Sanitize(response.message);
                let uid = response.uid;
                let messageElem = this.ui.createElement(`<div class="hud-chat-message"><strong><small>(${uid})</small> ${displayName}</strong>: ${message}</div>`);
                this.messagesElem.appendChild(messageElem);
                this.messagesElem.scrollTop = this.messagesElem.scrollHeight;
            };
        }
        exports.default = UiChat;
        /***/ }),
    /* 277 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 278 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 279 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 280 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 281 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 282 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 283 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 284 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 285 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 286 */
    /***/ (function(module, exports, __webpack_require__) {

        /***/ }),
    /* 287 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiDayNightOverlay');
        class UiDayNightOverlay extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-day-night-overlay\" class=\"hud-day-night-overlay\"></div>");
                Game_1.default.currentGame.renderer.addTickCallback(this.update.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('DayCycle', this.onDayNightTickUpdate.bind(this));
            }
            update() {
                let currentTick = Game_1.default.currentGame.world.getReplicator().getTickIndex();
                let dayRatio = 0;
                let nightRatio = 0;
                let nightOverlayOpacity = 0;
                if (!this.tickData || (this.tickData.dayEndTick === 0 && this.tickData.nightEndTick === 0) || currentTick % 10 !== 0) return;
                if (this.tickData.dayEndTick > 0) {
                    let dayLength = this.tickData.dayEndTick - this.tickData.cycleStartTick;
                    let dayTicksRemaining = this.tickData.dayEndTick - currentTick;
                    dayRatio = 1 - dayTicksRemaining / dayLength;
                    if (dayRatio < 0.2) {
                        nightOverlayOpacity = 0.5 * (1 - dayRatio / 0.2);
                    } else if (dayRatio > 0.8) {
                        nightOverlayOpacity = 0.5 * ((dayRatio - 0.8) / 0.2);
                    } else {
                        nightOverlayOpacity = 0;
                    }
                } else if (this.tickData.nightEndTick > 0) {
                    let nightLength = this.tickData.nightEndTick - this.tickData.cycleStartTick;
                    let nightTicksRemaining = this.tickData.nightEndTick - currentTick;
                    dayRatio = 1;
                    nightRatio = 1 - nightTicksRemaining / nightLength;
                    if (nightRatio < 0.2) {
                        nightOverlayOpacity = 0.5 + 0.5 * (nightRatio / 0.2);
                    } else if (nightRatio > 0.8) {
                        nightOverlayOpacity = 0.5 + 0.5 * (1 - (nightRatio - 0.8) / 0.2);
                    } else {
                        nightOverlayOpacity = 1;
                    }
                }
                this.componentElem.style.opacity = nightOverlayOpacity.toString();
                if (window.spaceBiomeStarGlowSprite) {
                    window.spaceBiomeStarGlowSprite.setAlpha(0);
                }
            };
            onDayNightTickUpdate(response) {
                this.tickData = response;
                this.update();
            };
        }
        exports.default = UiDayNightOverlay;
        /***/ }),
    /* 288 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiDayNightTicker');
        class UiDayNightTicker extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-day-night-ticker\" class=\"hud-day-night-ticker\">\n            <div class=\"hud-ticker-bar\"></div>\n            <div class=\"hud-ticker-marker\"></div>\n        </div>");
                this.announcedZombies = false;
                this.announcementOffsetMs = 20000;
                this.barElem = this.componentElem.querySelector('.hud-ticker-bar');
                this.markerElem = this.componentElem.querySelector('.hud-ticker-marker');
                Game_1.default.currentGame.renderer.addTickCallback(this.update.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('DayCycle', this.onDayNightTickUpdate.bind(this));
            }
            update() {
                let currentTick = Game_1.default.currentGame.world.getReplicator().getTickIndex();
                let msPerTick = 50;
                let dayRatio = 0;
                let nightRatio = 0;
                let barWidth = 130;
                if (!this.tickData || (this.tickData.dayEndTick === 0 && this.tickData.nightEndTick === 0) || currentTick % 10 !== 0) return;
                if (this.tickData.dayEndTick > 0) {
                    let dayLength = this.tickData.dayEndTick - this.tickData.cycleStartTick;
                    let dayTicksRemaining = this.tickData.dayEndTick - currentTick;
                    dayRatio = 1 - dayTicksRemaining / dayLength;
                    if (!this.announcedZombies && msPerTick * dayTicksRemaining <= this.announcementOffsetMs) {
                        this.announcedZombies = true;
                        if ([9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105, 121].includes(Game_1.default.currentGame.ui.playerTick.wave + 1) && Game_1.default.currentGame.ui.playerTick.isPaused === 0) {
                            game.ui.components.AnnouncementOverlay.showAnnouncement('<span class="hud-announcement-shutdown">Get ready for a nice boss wave, next wave...</span>');
                        } else this.ui.getComponent('AnnouncementOverlay').showAnnouncement('Night is fast approaching. Get to safety...');
                    }
                } else if (this.tickData.nightEndTick > 0) {
                    let nightLength = this.tickData.nightEndTick - this.tickData.cycleStartTick;
                    let nightTicksRemaining = this.tickData.nightEndTick - currentTick;
                    dayRatio = 1;
                    nightRatio = 1 - nightTicksRemaining / nightLength;
                    this.announcedZombies = false;
                }
                let currentPosition = (dayRatio * 1 / 2 + nightRatio * 1 / 2) * -barWidth;
                let offsetPosition = currentPosition + barWidth / 2;
                this.barElem.style['background-position'] = offsetPosition + 'px 0';
            };
            onDayNightTickUpdate(response) {
                this.tickData = response;
                this.update();
            };
        }
        exports.default = UiDayNightTicker;
        /***/ }),
    /* 289 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiHealthBar');
        class UiHealthBar extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-health-bar\" class=\"hud-health-bar\">\n            <div class=\"hud-health-bar-inner\" style=\"width:100%;\"></div>\n        </div>");
                this.lastPlayerTick = { health: 100, maxHealth: 100 };
                this.barElem = this.componentElem.querySelector('.hud-health-bar-inner');
                this.ui.on('playerTickUpdate', this.onPlayerTickUpdate.bind(this));
            }
            onPlayerTickUpdate(playerTick) {
                if (playerTick.health !== this.lastPlayerTick.health || playerTick.maxHealth !== this.lastPlayerTick.maxHealth) {
                    let healthPercentage = Math.round(playerTick.health / playerTick.maxHealth * 100);
                    this.barElem.style.width = healthPercentage + '%';
                }
                this.lastPlayerTick = playerTick;
            };
        }
        exports.default = UiHealthBar;
        /***/ }),
    /* 290 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let BinCodec_1 = __webpack_require__(262);
        let LocalPlayer_1 = __webpack_require__(207);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiIntro');
        class UiIntro extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<span></span>");
                this.connecting = false;
                this.componentElem = document.querySelector('.hud-intro');
                this.nameInputElem = this.componentElem.querySelector('.hud-intro-name');
                this.serverElem = this.componentElem.querySelector('.hud-intro-server');
                this.submitElem = this.componentElem.querySelector('.hud-intro-play');
                this.errorElem = this.componentElem.querySelector('.hud-intro-error');
                this.canvasInputElem = this.componentElem.querySelector('.hud-intro-canvas');
                this.leaderboardCategoryInputElem = this.componentElem.querySelector('.hud-intro-leaderboard-category');
                this.leaderboardTimeInputElem = this.componentElem.querySelector('.hud-intro-leaderboard-time');
                this.leaderboardPartiesElem = this.componentElem.querySelector('.hud-intro-leaderboard-parties');
                if ('localStorage' in window) {
                    this.nameInputElem.value = window.localStorage.getItem('name');
                    this.canvasInputElem.checked = window.localStorage.getItem('disableLoadingScreen') == 'true';
                }
                this.nameInputElem.addEventListener('keyup', this.onNameInputKeyUp.bind(this));
                this.submitElem.addEventListener('click', this.onSubmitClick.bind(this));
                this.canvasInputElem.addEventListener('change', this.onCanvasInputChange.bind(this));
                Game_1.default.currentGame.network.addErrorHandler(this.onConnectionError.bind(this));
                Game_1.default.currentGame.network.addEnterWorldHandler(this.onEnterWorld.bind(this));
                game.network.addPreEnterWorldHandler(this.onConnectionStart.bind(this))
                this.checkForPartyInvitation();
            }
            hide() {
                super.hide.call(this);
            };
            onNameInputKeyUp(event) {
                event.preventDefault();
                if (event.keyCode == 13) {
                    this.submitElem.click();
                }
            };
            onSubmitClick(event) {
                var server = this.ui.getOption('servers')[this.serverElem.value];
                if ('localStorage' in window) {
                    window.localStorage.setItem('name', this.nameInputElem.value);
                }
                if (this.connecting) return;
                this.connecting = true;
                const loadingScreenDisabled = window.isBansheeSessionLoaderDisabled && window.isBansheeSessionLoaderDisabled();
                if (!loadingScreenDisabled) {
                    Game_1.default.currentGame.renderer.entities.setVisible(false);
                    Game_1.default.currentGame.ui.components.BuffBar.hide();
                    Game_1.default.currentGame.ui.components.PipOverlay.hide();
                    Game_1.default.currentGame.ui.components.PopupOverlay.hide();
                    Game_1.default.currentGame.ui.components.AnnouncementOverlay.hide();
                    document.getElementsByClassName("hud-top-right")[0].style.display = "none";
                    if (window.showBansheeSessionLoader) window.showBansheeSessionLoader();
                }
                this.connectionTimer = setTimeout(() => {
                    if (!window.allowed1) return;
                    this.connecting = false;
                    document.getElementsByClassName("hud-top-right")[0].style.display = "flex";
                    if (window.hideBansheeSessionLoader) window.hideBansheeSessionLoader();
                    this.submitElem.innerHTML = 'Play';
                    this.serverElem.classList.add('has-error');
                    this.errorElem.style.display = 'block';
                    this.errorElem.innerText = 'We failed to join the game - this is a known issue with anti-virus software. Please try disabling any web filtering features.';
                }, 5000);
                this.submitElem.innerHTML = '<span class="hud-loading"></span>';
                this.errorElem.style.display = 'none';
                this.ui.setOption('nickname', this.nameInputElem.value);
                this.ui.setOption('serverId', this.serverElem.value);
                Game_1.default.currentGame.network.connect(server);
            };
            onCanvasInputChange(event) {
                if (window.setBansheeSessionLoaderDisabled) {
                    window.setBansheeSessionLoaderDisabled(this.canvasInputElem.checked);
                } else {
                    localStorage.setItem('disableLoadingScreen', this.canvasInputElem.checked ? 'true' : 'false');
                }
            };
            onConnectionStart(data) {
                game.network.sendEnterWorld({
                    displayName: game.ui.options.nickname,
                    extra: data.extra
                });
                game.network.codec = new BinCodec_1.default();
                let entity = game.world.entities.get(game.world.myUid);
                if (entity) {
                    entity.targetTick = null;
                    game.world.localPlayer = new LocalPlayer_1.default();
                    window.justreconnected = true;
                }
            }
            onConnectionError() {
                this.connecting = false;
                if (window.hideBansheeSessionLoader) window.hideBansheeSessionLoader();
                if (this.connectionTimer) {
                    clearInterval(this.connectionTimer);
                    delete this.connectionTimer;
                }
                this.submitElem.innerHTML = 'Play';
                this.serverElem.classList.add('has-error');
                this.errorElem.style.display = 'block';
                this.errorElem.innerText = 'We were unable to connect to the gameserver. Please try another server.';
            };
            onEnterWorld(data) {
                window.allowed1 = data.allowed;
                if (data.allowed) {
                    if (game.network.enterworld2) {
                        game.network.socket.send(game.network.enterworld2);
                    }
                }
                this.connecting = false;
                if (this.connectionTimer) {
                    clearInterval(this.connectionTimer);
                    delete this.connectionTimer;
                }
                if (!data.allowed) {
                    document.getElementsByClassName("hud-top-right")[0].style.display = "flex";
                    if (window.hideBansheeSessionLoader) window.hideBansheeSessionLoader();
                    this.submitElem.innerHTML = 'Play';
                    this.serverElem.classList.add('has-error');
                    this.errorElem.style.display = 'block';
                    this.errorElem.innerText = 'This server is currently full. Please try again later or select another server.';
                    game.network.socket.send(0);
                    window.justreconnected = true;
                    return;
                }
                if (window.hideBansheeSessionLoader) window.hideBansheeSessionLoader();
                this.hide();
                setTimeout(() => {
                    game.ui.components.Reconnect.hide();
                }, 1000);
            };
            checkForPartyInvitation() {
                if (!document.location.hash || document.location.hash.length < 2) return;
                const parts = document.location.hash.substring(2).split('/');
                const serverId = parts[0];
                const shareKey = parts[1];
                if (!serverId || !shareKey) return;
                this.serverElem.setAttribute('disabled', 'true');
                this.serverElem.querySelector('option[value="' + serverId + '"]').setAttribute('selected', 'true');
                this.partyShareKey = shareKey;
                Game_1.default.currentGame.network.addEnterWorldHandler((data) => {
                    if (!data.allowed || this.reconnectKey) return;
                    let psk = this.partyShareKey;
                    if (!user.connectedToId) {
                        Game_1.default.currentGame.network.sendRpc({name: 'JoinPartyByShareKey', partyShareKey: psk});
                    }
                });
            };
        }
        exports.default = UiIntro;
        /***/ }),
    /* 291 */
    /***/ ((module, exports, __webpack_require__) => {

        /***/ }),
    /* 292 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        const Sanitize = __webpack_require__(330).default;
        let debug = Debug('Game:Ui/UiLeaderboard');
        class UiLeaderboard extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-leaderboard\" class=\"hud-leaderboard\">\n            <div class=\"hud-leaderboard-player is-header\">\n                <span class=\"player-rank\">Rank</span>\n                <span class=\"player-name\">Name</span>\n                <span class=\"player-score\">Score</span>\n                <span class=\"player-wave\">Wave</span>\n            </div>\n            <div class=\"hud-leaderboard-players\"></div>\n        </div>");
                this.playerElems = [];
                this.playerRankElems = [];
                this.playerNameElems = [];
                this.playerScoreElems = [];
                this.playerWaveElems = [];
                this.leaderboardData = [];
                this.playersElem = this.componentElem.querySelector('.hud-leaderboard-players');
                Game_1.default.currentGame.network.addRpcHandler('Leaderboard', this.onLeaderboardData.bind(this));
            }
            update() {
                if (this.leaderboardData) {
                    let game = Game_1.default.currentGame;
                    for (let i = 0; i < this.leaderboardData.length; i++) {
                        const player = this.leaderboardData[i];
                        if (!(i in this.playerElems)) {
                            this.playerElems[i] = this.ui.createElement("<div class=\"hud-leaderboard-player\"></div>");
                            this.playerRankElems[i] = this.ui.createElement("<span class=\"player-rank\">-</span>");
                            this.playerNameElems[i] = this.ui.createElement("<strong class=\"player-name\">-</strong>");
                            this.playerScoreElems[i] = this.ui.createElement("<span class=\"player-score\">-</span>");
                            this.playerWaveElems[i] = this.ui.createElement("<span class=\"player-wave\">-</span>");
                            this.playerElems[i].appendChild(this.playerRankElems[i]);
                            this.playerElems[i].appendChild(this.playerNameElems[i]);
                            this.playerElems[i].appendChild(this.playerScoreElems[i]);
                            this.playerElems[i].appendChild(this.playerWaveElems[i]);
                            this.playersElem.appendChild(this.playerElems[i]);
                        }
                        if (game.world.getMyUid() === player.uid) {
                            this.playerElems[i].classList.add('is-active');
                        } else {
                            this.playerElems[i].classList.remove('is-active');
                        }
                        this.playerElems[i].style.display = 'block';
                        this.playerRankElems[i].innerText = '#' + (player.rank + 1);
                        this.playerNameElems[i].innerHTML = `<small>(${player.uid})</small> ${Sanitize(player.name)}`;
                        this.playerScoreElems[i].innerText = player.score.toLocaleString();
                        this.playerWaveElems[i].innerHTML = player.wave === 0 ? '<small>&mdash;</small>' : player.wave.toLocaleString();
                    }
                    if (this.leaderboardData.length < this.playerElems.length) {
                        for (let i = this.leaderboardData.length; i < this.playerElems.length; i++) {
                            this.playerElems[i].style.display = 'none';
                        }
                    }
                } else {
                    this.leaderboardData = [];
                    this.update();
                }
            };
            onLeaderboardData(response) {
                this.leaderboardData = response;
                this.update();
            };
        }
        exports.default = UiLeaderboard;
        /***/ }),
    /* 293 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiMap');
        class UiMap extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-map\" class=\"hud-map\"></div>");
                this.playerElems = {};
                this.buildingElems = {};
                Game_1.default.currentGame.renderer.addTickCallback(this.update.bind(this));
                this.ui.on('buildingsUpdate', this.onBuildingsUpdate.bind(this));
                this.ui.on('partyMembersUpdated', this.onPartyMembersUpdate.bind(this));
            }
            update() {
                for (const playerUid in this.playerElems) {
                    const playerData = this.playerElems[playerUid];
                    let networkEntity = Game_1.default.currentGame.world.getEntityByUid(parseInt(playerUid));
                    !networkEntity && window.socketsByUid && socketsByUid[playerUid] && (networkEntity = {getPositionX() {return socketsByUid[playerUid].x}, getPositionY() {return socketsByUid[playerUid].y}});
                    if (!networkEntity) {
                        if (parseInt(playerUid)) {
                            playerData.marker.style.display = 'none';
                        }
                        continue;
                    }
                    let xPos = Math.round(networkEntity.getPositionX() / Game_1.default.currentGame.world.getWidth() * 100);
                    let yPos = Math.round(networkEntity.getPositionY() / Game_1.default.currentGame.world.getHeight() * 100);
                    playerData.marker.setAttribute('data-index', playerData.index.toString());
                    playerData.marker.style.display = 'block';
                    playerData.marker.style.left = xPos + '%';
                    playerData.marker.style.top = yPos + '%';
                }
            };
            onBuildingsUpdate(buildings) {
                const staleElems = {};
                Object.keys(this.buildingElems).forEach(e => {
                    staleElems[e] = true;
                })
                Object.values(buildings).forEach(e => {
                    delete staleElems[e.uid];
                    if (!this.buildingElems[e.uid]) {
                        let buildingElem = this.ui.createElement("<div class=\"hud-map-building\"></div>");
                        let xPos = (buildings[e.uid].x / Game_1.default.currentGame.world.getWidth() * 100) | 0;
                        let yPos = (buildings[e.uid].y / Game_1.default.currentGame.world.getHeight() * 100) | 0;
                        buildingElem.style.left = xPos + '%';
                        buildingElem.style.top = yPos + '%';
                        this.componentElem.appendChild(buildingElem);
                        this.buildingElems[e.uid] = buildingElem;
                    }
                })
                Object.keys(staleElems).forEach(e => {
                    if (this.buildingElems[e]) {
                        this.buildingElems[e].remove();
                        delete this.buildingElems[e];
                    }
                })
            };
            onPartyMembersUpdate(partyMembers) {
                let staleElems = {};
                for (let playerUid in this.playerElems) {
                    staleElems[playerUid] = true;
                }
                for (let i in partyMembers) {
                    let index = parseInt(i);
                    let playerUid = partyMembers[i].playerUid;
                    delete staleElems[playerUid];
                    if (this.playerElems[playerUid]) {
                        this.playerElems[playerUid].index = index;
                    } else {
                        let partyMemberElem = this.ui.createElement("<div class=\"hud-map-player\" data-index=\"" + index + "\"></div>");
                        this.componentElem.appendChild(partyMemberElem);
                        this.playerElems[playerUid] = {
                            index: index,
                            marker: partyMemberElem
                        }
                    }
                }
                for (let playerUid in staleElems) {
                    if (!this.playerElems[playerUid]) {
                        continue;
                    }
                    this.playerElems[playerUid].marker.remove();
                    delete this.playerElems[playerUid];
                }
                if (window.sockets) {
                    staleElems = {};
                    for (let i in sockets) {
                        staleElems[sockets[i].uid] = true;
                    }
                    for (let i in sockets) {
                        let index = 5;
                        let playerUid = sockets[i].uid;
                        for (let i in partyMembers) {
                            if (partyMembers[i].playerUid == playerUid) {
                                index = i;
                            }
                        }
                        delete staleElems[playerUid];
                        if (game.ui.components.Map.playerElems[playerUid]) {
                            game.ui.components.Map.playerElems[playerUid].index = index;
                        } else {
                            let partyMemberElem = game.ui.components.Map.ui.createElement("<div class=\"hud-map-player\" data-index=\"" + index + "\"></div>");
                            game.ui.components.Map.componentElem.appendChild(partyMemberElem);
                            game.ui.components.Map.playerElems[playerUid] = {
                                index: index,
                                marker: partyMemberElem
                            }
                        }
                    }
                    for (let playerUid in staleElems) {
                        if (!game.ui.components.Map.playerElems[playerUid]) {
                            continue;
                        }
                        game.ui.components.Map.playerElems[playerUid].marker.remove();
                        delete game.ui.components.Map.playerElems[playerUid];
                    }
                }
            };
        }
        exports.default = UiMap;
        /***/ }),
    /* 294 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let UiTooltip_1 = __webpack_require__(275);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiMenuIcons');
        class UiMenuIcons extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-menu-icons\" class=\"hud-menu-icons\">\n            <div class=\"hud-menu-icon\" data-type=\"Shop\">Shop <small>(B)</small></div>\n            <div class=\"hud-menu-icon\" data-type=\"Party\">Party <small>(P)</small></div>\n            <div class=\"hud-menu-icon\" data-type=\"Settings\">Settings</div>\n            <div class=\"hud-menu-icon\" data-type=\"FPS\">Score Logs</div>\n        </div>")
                this.iconElems = [];
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.rawIconElements = this.componentElem.querySelectorAll('.hud-menu-icon');
                for (let i = 0; i < this.rawIconElements.length; i++) {
                    this._loop_1(i);
                }
            }
            _loop_1(i) {
                this.iconElems[i] = this.rawIconElements[i];
                this.iconElems[i].addEventListener('click', this.onIconClick(i).bind(this));
                new UiTooltip_1.default(this.iconElems[i], (elem) => {
                    return "<div class=\"hud-tooltip-menu-icon\">\n                    <h4>" + this.iconElems[i].innerHTML + "</h4>\n                </div>";
                }, 'left');
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
            onIconClick(i) {
                return (event) => {
                    let type = this.iconElems[i].getAttribute('data-type');
                    let buildingOverlay = this.ui.getComponent('BuildingOverlay');
                    let placementOverlay = this.ui.getComponent('PlacementOverlay');
                    let spellOverlay = this.ui.getComponent('SpellOverlay');
                    let menuShop = this.ui.getComponent('MenuShop');
                    let menuParty = this.ui.getComponent('MenuParty');
                    let menuSettings = this.ui.getComponent('MenuSettings');
                    let menuFPS = this.ui.getComponent('MenuFPS');
                    let menuScripts = this.ui.getComponent('MenuScripts');
                    event.stopPropagation();
                    buildingOverlay.stopWatching();
                    placementOverlay.cancelPlacing();
                    spellOverlay.cancelCasting();
                    if (type === 'Shop') {
                        menuParty.hide();
                        menuSettings.hide();
                        menuFPS.hide();
                        menuScripts.hide();
                        if (menuShop.isVisible()) {
                            menuShop.hide();
                        } else {
                            menuShop.show();
                        }
                    } else if (type === 'Party') {
                        menuShop.hide();
                        menuSettings.hide();
                        menuFPS.hide();
                        menuScripts.hide();
                        if (menuParty.isVisible()) {
                            menuParty.hide();
                        } else {
                            menuParty.show();
                        }
                    } else if (type === 'Settings') {
                        menuShop.hide();
                        menuParty.hide();
                        menuScripts.hide();
                        if (menuSettings.isVisible()) {
                            menuSettings.hide();
                        } else {
                            menuSettings.show();
                        }
                    } else if (type === 'FPS') {
                        menuShop.hide();
                        menuParty.hide();
                        if (menuFPS.isVisible()) {
                            menuFPS.hide();
                        } else {
                            menuFPS.show();
                        }
                    } else if (type === 'Scripts') {
                        menuShop.hide();
                        menuParty.hide();
                        menuSettings.hide();
                        if (menuScripts.isVisible()) {
                            menuScripts.hide();
                        } else {
                            menuScripts.show();
                        }
                    }
                }
            }
        }
        exports.default = UiMenuIcons;
        /***/ }),
    /* 295 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiMenuParty');
        const Sanitize = __webpack_require__(330).default;
        class UiMenuParty extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-menu-party\" class=\"hud-menu hud-menu-party\">\n            <a class=\"hud-menu-close\"></a>\n            <h3>Parties <small class=\"hud-party-server\"></small></h3>\n            <div class=\"hud-party-tabs\">\n                <a class=\"hud-party-tabs-link is-active\" data-type=\"Members\">Your Party</a>\n                <a class=\"hud-party-tabs-link\" data-type=\"Open\">Open Parties</a>\n            </div>\n            <div class=\"hud-party-members\"></div>\n            <div class=\"hud-party-grid\">\n                <div class=\"hud-party-joining\">Requesting to join...</div>\n                <div class=\"hud-party-empty\">No parties are currently available to join.</div>\n            </div>\n            <div class=\"hud-party-actions\">\n                <input type=\"text\" name=\"tag\" class=\"hud-party-tag\" placeholder=\"Your party's tag...\" maxlength=\"49\">\n                <input type=\"text\" name=\"link\" class=\"hud-party-share\" placeholder=\"Your party share link...\">\n                <a class=\"hud-party-visibility is-private\">Private</a>\n            </div>\n        </div>");
                this.tabElems = [];
                this.partyElems = {};
                this.memberElems = [];
                this.activeType = 'Members';
                this.maxPartySize = 4;
                this.closeElem = this.componentElem.querySelector('.hud-menu-close');
                this.serverElem = this.componentElem.querySelector('.hud-party-server');
                this.gridElem = this.componentElem.querySelector('.hud-party-grid');
                this.gridJoiningElem = this.componentElem.querySelector('.hud-party-joining');
                this.gridEmptyElem = this.componentElem.querySelector('.hud-party-empty');
                this.membersElem = this.componentElem.querySelector('.hud-party-members');
                this.tagInputElem = this.componentElem.querySelector('.hud-party-tag');
                this.shareInputElem = this.componentElem.querySelector('.hud-party-share');
                this.visibilityElem = this.componentElem.querySelector('.hud-party-visibility');
                let rawTabElements = this.componentElem.querySelectorAll('.hud-party-tabs-link');
                for (let i = 0; i < rawTabElements.length; i++) {
                    this.tabElems[i] = rawTabElements[i];
                    this.tabElems[i].addEventListener('click', this.onTabChange(this.tabElems[i]).bind(this));
                }
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.closeElem.addEventListener('click', this.hide.bind(this));
                this.tagInputElem.addEventListener('keyup', this.onTagChange.bind(this));
                this.shareInputElem.addEventListener('focus', this.onShareFocus.bind(this));
                this.visibilityElem.addEventListener('click', this.onVisibilityToggle.bind(this));
                this.ui.on('partyJoined', this.onPartyJoined.bind(this));
                this.ui.on('partyMembersUpdated', this.onPartyMembersUpdated.bind(this));
                this.ui.on('partiesUpdated', this.onPartiesUpdated.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('PartyApplicant', this.onPartyApplicant.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('PartyApplicantDenied', this.onPartyApplicantDenied.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('PartyApplicantExpired', this.onPartyApplicantExpired.bind(this));
            }
            update() {
                const parties = this.ui.getParties();
                const playerIsLeader = this.ui.getPlayerPartyLeader();
                const playerPartyData = parties[this.ui.getPlayerPartyId()];
                const playerPartyMembers = this.ui.getPlayerPartyMembers();
                const serverId = this.ui.getOption('serverId');
                const staleElems = {};
                let availableParties = 0;
                for (const partyId in this.partyElems) {
                    staleElems[partyId] = true;
                }
                for (const partyId in parties) {
                    const partyData = parties[partyId];
                    let partyElem = this.partyElems[partyId];
                    const partyNameSanitized = Sanitize(partyData.partyName);
                    delete staleElems[partyId];
                    if (!this.partyElems[partyId]) {
                        partyElem = this.ui.createElement("<div class=\"hud-party-link\"></div>");
                        this.gridElem.appendChild(partyElem);
                        this.partyElems[partyId] = partyElem;
                        partyElem.addEventListener('click', this.onPartyJoinRequestHandler(partyData.partyId).bind(this));
                    }
                    if (partyData.isOpen) {
                        partyElem.style.display = 'block';
                        availableParties++;
                    } else {
                        partyElem.style.display = 'none';
                    }
                    if (this.ui.getPlayerPartyId() === partyData.partyId) {
                        partyElem.classList.add('is-active');
                        partyElem.classList.remove('is-disabled');
                    } else if (partyData.memberCount === this.maxPartySize) {
                        partyElem.classList.remove('is-active');
                        partyElem.classList.add('is-disabled');
                    } else {
                        partyElem.classList.remove('is-active');
                        partyElem.classList.remove('is-disabled');
                    }
                    partyElem.innerHTML = "<strong>" + partyNameSanitized + "</strong><span>" + partyData.memberCount + "/" + this.maxPartySize + "</span><span>; " + partyData.partyId + "</span>";
                }
                for (const partyId in staleElems) {
                    if (!this.partyElems[partyId]) {
                        continue;
                    }
                    this.partyElems[partyId].remove();
                    delete this.partyElems[partyId];
                }
                for (const i in this.memberElems) {
                    this.memberElems[i].remove();
                    delete this.memberElems[i];
                }
                for (const i in playerPartyMembers) {
                    const playerName = Sanitize(playerPartyMembers[i].displayName);
                    const memberElem = this.ui.createElement("<div class=\"hud-member-link\">\n                <strong>" + playerName + "</strong>\n                <small>" + (playerPartyMembers[i].isLeader === 1 ? 'Leader' : 'Member') + "</small>\n                <div class=\"hud-member-actions\">\n                    <a class=\"hud-member-can-sell btn" + (!playerIsLeader || playerPartyMembers[i].isLeader === 1 ? ' is-disabled' : '') + (playerPartyMembers[i].canSell === 1 ? ' is-active' : '') + "\"><span class=\"hud-can-sell-tick\"></span> Can sell buildings</a>\n                    <a class=\"hud-member-kick btn btn-red" + (!playerIsLeader || playerPartyMembers[i].isLeader === 1 ? ' is-disabled' : '') + "\">FUCK OFF</a>\n                </div>\n            </div>");
                    this.membersElem.appendChild(memberElem);
                    this.memberElems[i] = memberElem;
                    if (playerIsLeader && playerPartyMembers[i].isLeader === 0) {
                        const kickElem = memberElem.querySelector('.hud-member-kick');
                        const canSellElem = memberElem.querySelector('.hud-member-can-sell');
                        kickElem.addEventListener('click', this.onPartyMemberKick(i).bind(this));
                        canSellElem.addEventListener('click', this.onPartyMemberCanSellToggle(i).bind(this));
                    }
                }
                if (availableParties > 0) {
                    this.gridEmptyElem.style.display = 'none';
                } else {
                    this.gridEmptyElem.style.display = 'block';
                }
                if (!playerPartyData) {
                    this.tagInputElem.value = `Party${this.ui.getPlayerPartyId()}`;
                    this.shareInputElem.value = 'http://' + (document.location.hostname == "localhost" ? "localhost" : document.location.hostname) + '/#/' + serverId + '/' + this.ui.getPlayerPartyShareKey();
                    this.visibilityElem.innerHTML = "Private";
                    this.visibilityElem.classList.add('is-disabled');
                    return;
                }
                if (document.activeElement !== this.tagInputElem) {
                    this.tagInputElem.value = playerPartyData.partyName;
                }
                if (playerIsLeader) {
                    this.tagInputElem.removeAttribute('disabled');
                } else {
                    this.tagInputElem.setAttribute('disabled', 'true');
                }
                this.shareInputElem.removeAttribute('disabled');
                this.shareInputElem.value = 'http://' + (document.location.hostname == "localhost" ? "localhost" : document.location.hostname) + '/#/' + serverId + '/' + this.ui.getPlayerPartyShareKey();
                if (playerIsLeader) {
                    this.visibilityElem.classList.remove('is-disabled');
                } else {
                    this.visibilityElem.classList.add('is-disabled');
                }
                if (playerPartyData.isOpen) {
                    this.visibilityElem.classList.remove('is-private');
                    this.visibilityElem.innerText = 'Public';
                } else {
                    this.visibilityElem.classList.add('is-private');
                    this.visibilityElem.innerText = 'Private';
                }
            };
            setTab(type) {
                for (let i = 0; i < this.tabElems.length; i++) {
                    const tabType = this.tabElems[i].getAttribute('data-type');
                    if (type === tabType) {
                        this.tabElems[i].classList.add('is-active');
                    } else {
                        this.tabElems[i].classList.remove('is-active');
                    }
                }
                this.activeType = type;
                if (this.activeType == 'Members') {
                    this.gridElem.style.display = 'none';
                    this.membersElem.style.display = 'block';
                } else {
                    this.gridElem.style.display = 'block';
                    this.membersElem.style.display = 'none';
                }
            };
            onTabChange(tabElem) {
                return (event) => {
                    let type = tabElem.getAttribute('data-type');
                    this.setTab(type);
                };
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
            onPartyJoined(partyId) {
                this.gridElem.classList.remove('is-disabled');
                this.gridJoiningElem.style.display = 'none';
                this.update();
            };
            onPartyMembersUpdated(partyId) {
                this.update();
            };
            onPartiesUpdated() {
                this.update();
            };
            onTagChange(event) {
                let partyName = this.tagInputElem.value.trim();
                if (partyName.length === 0) {
                    partyName = this.ui.getPlayerTick().name;
                }
                Game_1.default.currentGame.network.sendRpc({name: 'SetPartyName', partyName: partyName});
            };
            onShareFocus(event) {
                this.shareInputElem.select();
            };
            onVisibilityToggle(event) {
                const parties = this.ui.getParties();
                const partyId = this.ui.getPlayerPartyId();
                event.stopPropagation();
                if (this.visibilityElem.classList.contains('is-disabled')) return;
                Game_1.default.currentGame.network.sendRpc({name: 'SetOpenParty', isOpen: parties[partyId].isOpen ? 0 : 1});
            };
            onPartyMemberKick(i) {
                return (event) => {
                    const partyMembers = this.ui.getPlayerPartyMembers();
                    const popupOverlay = this.ui.getComponent('PopupOverlay');
                    event.stopPropagation();
                    popupOverlay.showConfirmation('Are you sure you want to fuck this player off from your party?', 10000, () => {
                        Game_1.default.currentGame.network.sendRpc({name: 'KickParty', uid: partyMembers[i].playerUid});
                    });
                };
            };
            onPartyMemberCanSellToggle(i) {
                return (event) => {
                    const partyMembers = this.ui.getPlayerPartyMembers();
                    event.stopPropagation();
                    Game_1.default.currentGame.network.sendRpc({name: 'SetPartyMemberCanSell', uid: partyMembers[i].playerUid, canSell: partyMembers[i].canSell === 1 ? 0 : 1});
                };
            };
            onPartyJoinRequestHandler(partyId) {
                return (event) => {
                    const linkElem = this.partyElems[partyId];
                    event.stopPropagation();
                    if (linkElem.classList.contains('is-disabled') || linkElem.classList.contains('is-active')) return;
                    const buildings = this.ui.getBuildings();
                    if (Object.keys(buildings).length === 0) {
                        this.gridElem.classList.add('is-disabled');
                        this.gridJoiningElem.style.display = 'block';
                        Game_1.default.currentGame.network.sendRpc({name: 'JoinParty', partyId: partyId});
                        return;
                    }
                    const popupOverlay = this.ui.getComponent('PopupOverlay');
                    popupOverlay.showConfirmation("Your existing base will be destroyed if you join this party. Are you sure?", 10000, () => {
                        this.gridElem.classList.add('is-disabled');
                        this.gridJoiningElem.style.display = 'block';
                        Game_1.default.currentGame.network.sendRpc({name: 'JoinParty', partyId: partyId});
                    });
                };
            };
            onPartyApplicant(response) {
                const popupOverlay = this.ui.getComponent('PopupOverlay');
                const playerName = Sanitize(response.displayName);
                popupOverlay.showConfirmation("<strong>" + playerName + "</strong> wants to join your party...", 30000, function () {
                    Game_1.default.currentGame.network.sendRpc({name: 'PartyApplicantDecide', applicantUid: response.applicantUid, accepted: 1});
                }, () => {
                    Game_1.default.currentGame.network.sendRpc({name: 'PartyApplicantDecide', applicantUid: response.applicantUid, accepted: 0});
                });
            };
            onPartyApplicantDenied(response) {
                this.gridElem.classList.remove('is-disabled');
                this.gridJoiningElem.style.display = 'none';
            };
            onPartyApplicantExpired(response) {
                this.gridElem.classList.remove('is-disabled');
                this.gridJoiningElem.style.display = 'none';
            };
        }
        exports.default = UiMenuParty;
        /***/ }),
    /* 296 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let UiShopItem_1 = __webpack_require__(297);
        let UiShopHatItem_1 = __webpack_require__(298);
        let UiShopPetItem_1 = __webpack_require__(299);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiMenuShop');
        class UiMenuShop extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-menu-shop\" class=\"hud-menu hud-menu-shop\">\n            <a class=\"hud-menu-close\"></a>\n            <h3>Shop</h3>\n            <div class=\"hud-shop-tabs\">\n                <a class=\"hud-shop-tabs-link is-active\" data-type=\"Weapon\">Weapons</a>\n                <a class=\"hud-shop-tabs-link\" data-type=\"Armor\">Armor</a>\n                <a class=\"hud-shop-tabs-link\" data-type=\"Hat\">Hats</a>\n                <a class=\"hud-shop-tabs-link\" data-type=\"Pet\">Pets</a>\n                <a class=\"hud-shop-tabs-link\" data-type=\"Utility\">Utility</a>\n            </div>\n            <div class=\"hud-shop-grid\"></div>\n            <div class=\"ad-unit ad-unit-medrec ad-unit-medrec-shop\"></div>\n            <div class=\"ad-unit ad-unit-leaderboard ad-unit-leaderboard-shop\"></div>\n        </div>");
                this.tabElems = [];
                this.shopItems = {};
                this.medrecId = 1000;
                this.leaderboardId = 1000;
                this.activeType = 'Weapon';
                this.closeElem = this.componentElem.querySelector('.hud-menu-close');
                this.gridElem = this.componentElem.querySelector('.hud-shop-grid');
                let rawTabElements = this.componentElem.querySelectorAll('.hud-shop-tabs-link');
                let itemSchema = this.ui.getItemSchema();
                for (let i = 0; i < rawTabElements.length; i++) {
                    this.tabElems[i] = rawTabElements[i];
                    this.tabElems[i].addEventListener('click', this.onTabChange(this.tabElems[i]).bind(this));
                }
                for (const itemId in itemSchema) {
                    if (!itemSchema[itemId].canPurchase) {
                        continue;
                    }
                    if (itemSchema[itemId].type == 'Hat') {
                        this.shopItems[itemId] = new UiShopHatItem_1.default(this.ui, itemId);
                    } else if (itemSchema[itemId].type == 'Pet') {
                        this.shopItems[itemId] = new UiShopPetItem_1.default(this.ui, itemId);
                    } else {
                        this.shopItems[itemId] = new UiShopItem_1.default(this.ui, itemId);
                    }
                    this.shopItems[itemId].on('purchaseItem', this.onShopItemPurchase.bind(this));
                    this.shopItems[itemId].on('equipItem', this.onShopEquipItem.bind(this));
                    this.gridElem.appendChild(this.shopItems[itemId].getComponentElem());
                    if (this.activeType !== itemSchema[itemId].type) {
                        this.shopItems[itemId].hide();
                    }
                }
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.closeElem.addEventListener('click', this.hide.bind(this));
                this.ui.on('itemConsumed', this.onItemConsumed.bind(this));
                this.ui.on('wavePaused', this.onWavePaused.bind(this));
                this.ui.on('shouldEquipItem', this.onShopEquipItem.bind(this));
                Game_1.default.currentGame.network.addEnterWorldHandler(this.onEnterWorld.bind(this));
            }
            show() {
                super.show.call(this);
                this.medrecId++;
                this.leaderboardId++;
            };
            hide() {
                super.hide.call(this);
            };
            update() {
                const itemSchema = this.ui.getItemSchema();
                for (const itemId in this.shopItems) {
                    const schemaData = itemSchema[itemId];
                    this.activeType == schemaData.type ? this.shopItems[itemId].show() : this.shopItems[itemId].hide();
                }
            };
            setTab(type) {
                for (let i = 0; i < this.tabElems.length; i++) {
                    let tabType = this.tabElems[i].getAttribute('data-type');
                    if (type === tabType) {
                        this.tabElems[i].classList.add('is-active');
                    } else {
                        this.tabElems[i].classList.remove('is-active');
                    }
                }
                this.activeType = type;
                this.update();
            };
            checkSocialLinks() {
                const inventory = this.ui.getInventory();
                if (!inventory.HatHorns || inventory.HatHorns.stacks === 0) {
                    Game_1.default.currentGame.network.sendRpc({name: 'BuyItem', itemName: 'HatHorns', tier: 1});
                }
                if (!inventory.PetCARL || inventory.PetCARL.stacks === 0) {
                    Game_1.default.currentGame.network.sendRpc({name: 'BuyItem', itemName: 'PetCARL', tier: 1});
                }
                if (!inventory.PetMiner || inventory.PetMiner.stacks === 0) {
                    Game_1.default.currentGame.network.sendRpc({name: 'BuyItem', itemName: 'PetMiner', tier: 1});
                }
            };
            onTabChange(tabElem) {
                return (event) => {
                    let type = tabElem.getAttribute('data-type');
                    this.setTab(type);
                };
            };
            onItemConsumed(itemName, itemTier) {
                if (itemName !== 'HealthPotion' && itemName !== 'PetHealthPotion') {
                    return;
                }
                this.shopItems.HealthPotion.setOnCooldown(500);
                this.shopItems.PetHealthPotion.setOnCooldown(500);
            };
            onWavePaused() {
                let itemSchema = this.ui.getItemSchema();
                let schemaData = itemSchema.Pause;
                if (!this.shopItems.Pause) return;
                this.shopItems.Pause.setOnCooldown(schemaData.purchaseCooldown);
            };
            onEnterWorld(data) {
                if (!data.allowed) return;
                this.checkSocialLinks();
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
            onShopItemPurchase(itemId, itemTier) {
                Game_1.default.currentGame.network.sendRpc({name: 'BuyItem', itemName: itemId, tier: itemTier});
            };
            onShopEquipItem(itemId, itemTier) {
                Game_1.default.currentGame.network.sendRpc({name: 'EquipItem', itemName: itemId, tier: itemTier});
                this.ui.emit('itemEquippedOrUsed', itemId, itemTier);
            };
        }
        exports.default = UiMenuShop;
        /***/ }),
    /* 297 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiShopItem');
        class UiShopItem extends UiComponent_1.default {
            constructor(ui, itemId) {
                super(ui, "<a class=\"hud-shop-item\" data-item=\"" + itemId + "\" data-tier=\"1\"></a>");
                this.itemId = itemId;
                this.itemTier = 1;
                let itemSchema = this.ui.getItemSchema();
                let schemaData = itemSchema[this.itemId];
                this.componentElem.setAttribute('data-type', schemaData.type);
                this.componentElem.addEventListener('click', this.onClick.bind(this));
                this.ui.on('itemSchemaUpdate', this.onItemSchemaUpdate.bind(this));
                this.ui.on('inventoryUpdate', this.onInventoryUpdate.bind(this));
            }
            setOnCooldown(cooldownInMs) {
                this.componentElem.classList.add('is-on-cooldown');
                setTimeout(() => {
                    this.componentElem.classList.remove('is-on-cooldown');
                }, cooldownInMs);
            };
            update() {
                let itemSchema = this.ui.getItemSchema();
                let itemInventory = this.ui.getInventory();
                let schemaData = itemSchema[this.itemId];
                let inventoryData = itemInventory[this.itemId];
                let maxTier = false;
                let canUpgrade = false;
                let currentStats = {};
                let nextStats = {};
                let statsHtml = "";
                let costsHtml = "";
                const statMap = {
                    damage: 'Damage',
                    harvest: 'Harvest',
                    range: 'Range',
                    attackSpeed: 'Attack Speed',
                    health: 'Health',
                    recharge: 'Recharge Delay'
                };
                if (inventoryData) {
                    this.itemTier = inventoryData.tier;
                } else {
                    this.itemTier = 1;
                }
                if (schemaData.tiers > 1 && this.itemTier < schemaData.tiers) {
                    this.nextTier = inventoryData && inventoryData.stacks > 0 ? this.itemTier + 1 : 1;
                    maxTier = false;
                    canUpgrade = true;
                } else if (schemaData.tiers == 1) {
                    this.nextTier = 1;
                    maxTier = inventoryData && inventoryData.stacks > 0;
                    canUpgrade = !maxTier;
                } else {
                    this.nextTier = this.itemTier;
                    maxTier = true;
                    canUpgrade = false;
                }
                for (const key in statMap) {
                    let current = "<small>&mdash;</small>";
                    let next = "<small>&mdash;</small>";
                    if (!schemaData || !schemaData[key + 'Tiers']) {
                        continue;
                    }
                    if (inventoryData) {
                        current = schemaData[key + 'Tiers'][this.itemTier - 1].toLocaleString();
                    }
                    if (!maxTier) {
                        next = schemaData[key + 'Tiers'][this.nextTier - 1].toLocaleString();
                    }
                    currentStats[key] = "<p>" + statMap[key] + ": <span class=\"hud-stats-current\">" + current + "</span></p>";
                    nextStats[key] = "<p>" + statMap[key] + ": <span class=\"hud-stats-next\">" + next + "</span></p>";
                }
                if (schemaData.goldCosts && schemaData.goldCosts[this.nextTier - 1] > 0) {
                    costsHtml = "<span class=\"hud-shop-item-gold\">" + schemaData.goldCosts[this.nextTier - 1].toLocaleString() + "</span>";
                }
                if (schemaData.tokenCosts && schemaData.tokenCosts[this.nextTier - 1] > 0) {
                    costsHtml = "<span class=\"hud-shop-item-tokens\">" + schemaData.tokenCosts[this.nextTier - 1].toLocaleString() + "</span>";
                }
                if (!costsHtml) {
                    costsHtml = "<span class=\"hud-shop-item-free\">Free</span>";
                }
                if (Object.keys(currentStats).length > 0) {
                    let currentStatsHtml = "";
                    let nextStatsHtml = "";
                    for (const i in currentStats) {
                        currentStatsHtml += currentStats[i];
                    }
                    for (const i in nextStats) {
                        nextStatsHtml += nextStats[i];
                    }
                    statsHtml = "\n            <span class=\"hud-shop-item-stats\">\n                <span class=\"hud-stats-current hud-stats-values\">" + currentStatsHtml + "</span>\n                <span class=\"hud-stats-next hud-stats-values\">" + nextStatsHtml + "</span>\n            </span>\n            ";
                } else {
                    statsHtml = "\n            <span class=\"hud-shop-item-description\">" + schemaData.description + "</span>\n            ";
                }
                this.componentElem.setAttribute('data-type', schemaData.type);
                this.componentElem.setAttribute('data-tier', this.nextTier.toString());
                if (canUpgrade) {
                    this.componentElem.classList.remove('is-disabled');
                } else {
                    this.componentElem.classList.add('is-disabled');
                }
                this.componentElem.innerHTML = "\n            <strong>" + schemaData.name + "</strong>\n            <span class=\"hud-shop-item-tier\">Tier " + this.nextTier + "</span>\n            " + costsHtml + "\n            " + statsHtml + "\n        ";
            };
            onClick(event) {
                event.stopPropagation();
                if (this.componentElem.classList.contains('is-disabled') || this.componentElem.classList.contains('is-on-cooldown')) return;
                game.network.sendRpc({name: "BuyItem", itemName: this.itemId, tier: game.ui.inventory[this.itemId] ? game.ui.inventory[this.itemId].tier + 1 : 1});
            };
            onItemSchemaUpdate() {
                this.update();
            };
            onInventoryUpdate() {
                this.update();
            };
        }
        exports.default = UiShopItem;
        /***/ }),
    /* 298 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiShopItem_1 = __webpack_require__(297);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiShopHatItem');
        class UiShopHatItem extends UiShopItem_1.default {
            constructor(ui, itemId) {
                super(ui, itemId);
                this.ui.on('equippedHat', this.update.bind(this));
            }
            update() {
                let itemSchema = this.ui.getItemSchema();
                let itemInventory = this.ui.getInventory();
                let schemaData = itemSchema[this.itemId];
                let inventoryData = itemInventory[this.itemId];
                let costsHtml = "";
                if (inventoryData) {
                    this.itemTier = inventoryData.tier;
                } else {
                    this.itemTier = 1;
                }
                this.nextTier = 1;
                if (schemaData.goldCosts && schemaData.goldCosts[this.nextTier - 1] > 0) {
                    costsHtml = "<span class=\"hud-shop-item-gold\">" + schemaData.goldCosts[this.nextTier - 1].toLocaleString() + "</span>";
                }
                if (schemaData.tokenCosts && schemaData.tokenCosts[this.nextTier - 1] > 0) {
                    costsHtml = "<span class=\"hud-shop-item-tokens\">" + schemaData.tokenCosts[this.nextTier - 1].toLocaleString() + "</span>";
                }
                if (!costsHtml) {
                    costsHtml = "<span class=\"hud-shop-item-free\">Free</span>";
                }
                this.componentElem.setAttribute('data-type', schemaData.type);
                this.componentElem.setAttribute('data-tier', this.nextTier.toString());
                if (!inventoryData || inventoryData.stacks === 0) {
                    this.componentElem.classList.remove('is-owned');
                } else {
                    this.componentElem.classList.add('is-owned');
                }
                if (inventoryData) {
                    let isEquipped = this.ui.getPlayerHatName() === this.itemId;
                    this.componentElem.classList.remove('is-social');
                    this.componentElem.innerHTML = "\n                <strong>" + schemaData.name + "</strong>\n                <span class=\"hud-shop-item-actions\">\n                    <a class=\"hud-shop-actions-equip" + (isEquipped ? ' is-disabled' : '') + "\">" + (isEquipped ? 'Equipped' : 'Equip Hat') + "</a>\n                </span>\n            ";
                    let equipElem = this.componentElem.querySelector('.hud-shop-actions-equip');
                    equipElem.addEventListener('click', this.onEquipItem.bind(this));
                    return;
                } else if (this.itemId == 'HatComingSoon') {
                    this.componentElem.classList.add('is-disabled');
                    this.componentElem.innerHTML = "\n                <span class=\"hud-shop-item-coming-soon\">" + schemaData.description + "</span>\n            ";
                    return;
                } else if (this.itemId == 'HatHorns') {
                    this.componentElem.classList.add('is-social');
                    let menuShop = this.ui.getComponent('MenuShop');
                    this.componentElem.innerHTML = "\n                <strong>" + schemaData.name + "</strong>\n                <span class=\"hud-shop-item-social\">\n                    <a href=\"https://twitter.com/intent/follow?original_referer=http%3A%2F%2Fzombs.io%2F&ref_src=twsrc%5Etfw&screen_name=ZOMBSio&tw_p=followbutton\" class=\"hud-shop-social-twitter" + (' is-disabled') + "\" target=\"_blank\">Follow</a>\n                    <a href=\"https://www.facebook.com/zombsio/\" class=\"hud-shop-social-facebook" + (' is-disabled') + "\" target=\"_blank\">Like</a>\n                </span>\n            ";
                    return;
                }
                this.componentElem.innerHTML = "\n            <strong>" + schemaData.name + "</strong>\n            <span class=\"hud-shop-item-tier\">Hat</span>\n            " + costsHtml + "\n        ";
            };
            onClick(event) {
                event.stopPropagation();
                if (this.componentElem.classList.contains('is-disabled') || this.componentElem.classList.contains('is-on-cooldown') || this.componentElem.classList.contains('is-owned') || this.componentElem.classList.contains('is-social')) return;
                this.emit('purchaseItem', this.itemId, this.nextTier);
            };
            onEquipItem(event) {
                event.stopPropagation();
                if (this.componentElem.classList.contains('is-disabled') || this.componentElem.classList.contains('is-on-cooldown')) return;
                this.emit('equipItem', this.itemId, this.itemTier);
            };
        }
        exports.default = UiShopHatItem;
        /***/ }),
    /* 299 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiShopItem_1 = __webpack_require__(297);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiShopPetItem');
        class UiShopPetItem extends UiShopItem_1.default {
            constructor(ui, itemId) {
                super(ui, itemId);
                this.inTimeoutAction = false;
                this.health = 0;
                this.experience = 0;
                this.level = 0;
                this.ui.on('equippedPet', this.update.bind(this));
                this.ui.on('playerPetTickUpdate', this.onPetTickUpdate.bind(this));
            }
            update() {
                let itemSchema = this.ui.getItemSchema();
                let itemInventory = this.ui.getInventory();
                let schemaData = itemSchema[this.itemId];
                let inventoryData = itemInventory[this.itemId];
                let maxTier = false;
                let canUpgrade = true;
                let evolutionLevels = [8, 16, 24, 32, 48, 64, 96];
                let costsHtml = "";
                let buttonCostsHtml = "";
                if (inventoryData) {
                    this.itemTier = inventoryData.tier;
                } else {
                    this.itemTier = 1;
                }
                if (this.inTimeoutAction) return;
                if (schemaData.tiers > 1 && this.itemTier < schemaData.tiers) {
                    this.nextTier = inventoryData && inventoryData.stacks > 0 ? this.itemTier + 1 : 1;
                    maxTier = false;
                    canUpgrade = true;
                } else {
                    this.nextTier = this.itemTier;
                    maxTier = true;
                    canUpgrade = false;
                }
                if (schemaData.goldCosts && schemaData.goldCosts[this.nextTier - 1] > 0) {
                    costsHtml = "<span class=\"hud-shop-item-gold\">" + schemaData.goldCosts[this.nextTier - 1].toLocaleString() + "</span>";
                    buttonCostsHtml = schemaData.goldCosts[this.nextTier - 1].toLocaleString() + " gold";
                }
                if (schemaData.tokenCosts && schemaData.tokenCosts[this.nextTier - 1] > 0) {
                    costsHtml = "<span class=\"hud-shop-item-tokens\">" + schemaData.tokenCosts[this.nextTier - 1].toLocaleString() + "</span>";
                    buttonCostsHtml = schemaData.tokenCosts[this.nextTier - 1].toLocaleString() + " tokens";
                }
                if (!costsHtml) {
                    costsHtml = "<span class=\"hud-shop-item-free\">Free</span>";
                    buttonCostsHtml = "free";
                }
                this.componentElem.setAttribute('data-type', schemaData.type);
                this.componentElem.setAttribute('data-tier', this.nextTier.toString());
                if (!inventoryData || inventoryData.stacks === 0) {
                    this.componentElem.classList.remove('is-owned');
                } else {
                    this.componentElem.classList.add('is-owned');
                }
                if (inventoryData) {
                    let isEquipped = this.ui.getPlayerPetName() === this.itemId;
                    let isDead = this.health === 0;
                    let nextLevelProgress = this.experience % 100;
                    let targetLevel = evolutionLevels[this.itemTier - 1];
                    let remainingLevels = targetLevel - this.level;
                    let levelHtml = "Level " + (this.level + 1) + " <span class=\"hud-shop-item-xp\"><span style=\"width:" + nextLevelProgress + "%;\"></span></span> Level " + (this.level + 2);
                    let equipHtml = "<a class=\"hud-shop-actions-equip" + (isEquipped ? ' is-disabled' : '') + "\">" + (isEquipped ? 'Equipped' : 'Equip Pet') + "</a>";
                    let evolveHtml = "<a class=\"hud-shop-actions-evolve" + (remainingLevels > 0 ? ' is-disabled' : '') + "\">" + (remainingLevels <= 0 ? 'Evolve Pet (' + buttonCostsHtml + ')' : 'Evolve Pet <small>(in ' + remainingLevels + ' level' + (remainingLevels === 1 ? '' : 's') + ', ' + buttonCostsHtml + ')</small>') + "</a>";
                    this.componentElem.setAttribute('data-tier', this.itemTier.toString());
                    this.componentElem.classList.remove('is-social');
                    if (!canUpgrade) {
                        levelHtml = "Fully Evolved";
                        costsHtml = "";
                        evolveHtml = "<a class=\"hud-shop-actions-evolve is-disabled\">Fully Evolved</a>";
                    }
                    if (isEquipped && isDead) {
                        equipHtml = "<a class=\"hud-shop-actions-revive\">Revive Pet</a>";
                    }
                    this.componentElem.innerHTML = "\n                <strong>" + schemaData.name + "</strong>\n                <span class=\"hud-shop-item-tier\">" + levelHtml + "</span>\n                <span class=\"hud-shop-item-actions\">\n                    " + equipHtml + "\n                    " + evolveHtml + "\n                </span>\n                " + costsHtml + "\n            ";
                    let equipElem = this.componentElem.querySelector('.hud-shop-actions-equip');
                    let reviveElem = this.componentElem.querySelector('.hud-shop-actions-revive');
                    let evolveElem = this.componentElem.querySelector('.hud-shop-actions-evolve');
                    if (reviveElem) {
                        reviveElem.addEventListener('click', this.onRevivePet.bind(this));
                    } else {
                        equipElem.addEventListener('click', this.onEquipPet.bind(this));
                    }
                    evolveElem.addEventListener('click', this.onEvolvePet.bind(this));
                    return;
                } else if (this.itemId == 'PetComingSoon') {
                    this.componentElem.classList.add('is-disabled');
                    this.componentElem.innerHTML = "\n                <span class=\"hud-shop-item-coming-soon\">" + schemaData.description + "</span>\n            ";
                    return;
                } else if (this.itemId == 'PetCARL') {
                    let menuShop = this.ui.getComponent('MenuShop');
                    this.componentElem.innerHTML = "\n                <strong>" + schemaData.name + "</strong>\n                <span class=\"hud-shop-item-tier\">" + schemaData.description + "</span>\n                <span class=\"hud-shop-item-social\">\n                    <span>To obtain:</span>\n                    <a class=\"hud-shop-social-twitter" + (' is-disabled') + "\" target=\"_blank\">Tweet</a>\n                    <a class=\"hud-shop-social-facebook" + (' is-disabled') + "\" target=\"_blank\">Share</a>\n                </span>\n            ";
                    return;
                } else if (this.itemId === 'PetMiner') {
                    let menuShop = this.ui.getComponent('MenuShop');
                    this.componentElem.innerHTML = "\n                <strong>" + schemaData.name + "</strong>\n                <span class=\"hud-shop-item-tier\">" + schemaData.description + "</span>\n                <span class=\"hud-shop-item-social\">\n                    <span>To obtain:</span>\n                    <a href=\"https://www.youtube.com/channel/UCo9aJFjNTFxXaxg2UxGsBUA?sub_confirmation=1\" class=\"hud-shop-social-youtube" + (' is-disabled') + "\" target=\"_blank\">Subscribe</a>\n                </span>\n            ";
                    return;
                }
                this.componentElem.innerHTML = "\n            <strong>" + schemaData.name + "</strong>\n            <span class=\"hud-shop-item-tier\">" + schemaData.description + "</span>\n            " + costsHtml + "\n        ";
            };
            onClick(event) {
                event.stopPropagation();
                if (this.componentElem.classList.contains('is-on-cooldown') || this.componentElem.classList.contains('is-owned')) return;
                this.emit('purchaseItem', this.itemId, this.nextTier);
            };
            onEquipPet(event) {
                event.stopPropagation();
                if (this.componentElem.classList.contains('is-on-cooldown')) return;
                this.emit('equipItem', this.itemId, this.itemTier);
            };
            onRevivePet(event) {
                event.stopPropagation();
                let reviveElem = this.componentElem.querySelector('.hud-shop-actions-revive');
                reviveElem.innerHTML = '<span class="hud-loading"></span> Reviving...';
                reviveElem.classList.add('is-disabled');
                this.inTimeoutAction = true;
                setTimeout(() => {
                    reviveElem.innerHTML = 'Revive';
                    reviveElem.classList.remove('is-disabled');
                    this.inTimeoutAction = false;
                    this.emit('purchaseItem', 'PetRevive', 1);
                    this.emit('equipItem', 'PetRevive', 1);
                }, 3000);
            };
            onEvolvePet(event) {
                event.stopPropagation();
                let evolveElem = this.componentElem.querySelector('.hud-shop-actions-evolve');
                let evolveHtml = evolveElem.innerHTML;
                if (evolveElem.classList.contains('is-disabled')) return;
                evolveElem.innerHTML = '<span class="hud-loading"></span> Evolving...';
                evolveElem.classList.add('is-disabled');
                this.inTimeoutAction = true;
                setTimeout(() => {
                    evolveElem.innerHTML = evolveHtml;
                    evolveElem.classList.remove('is-disabled');
                    this.inTimeoutAction = false;
                    this.emit('purchaseItem', this.itemId, this.nextTier);
                }, 3000);
            };
            onPetTickUpdate(tick) {
                if (tick.model !== this.itemId) return;
                let itemInventory = this.ui.getInventory();
                let inventoryData = itemInventory[this.itemId];
                if (!inventoryData || inventoryData.stacks === 0) return;
                if (this.health === tick.health && this.experience === tick.experience) return;
                this.health = tick.health;
                this.experience = tick.experience;
                this.level = Math.floor(tick.experience / 100);
                this.update();
            };
        }
        exports.default = UiShopPetItem;
        /***/ }),
    /* 300 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiMenuSettings');
        class UiMenuSettings extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-menu-settings\" class=\"hud-menu hud-menu-settings\">\n            <a class=\"hud-menu-close\"></a>\n            <h3>Settings</h3>\n            <div class=\"hud-settings-grid\">\n                <label for=\"hud-intro-name\">\n                    <span>Winter Trees</span>\n                    <a class=\"btn btn-green is-active\">Christmas Lights</a>\n                </label>\n            </div>\n        </div>");
                this.closeElem = this.componentElem.querySelector('.hud-menu-close');
                this.gridElem = this.componentElem.querySelector('.hud-settings-grid');
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.closeElem.addEventListener('click', this.hide.bind(this));
            }
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
        }
        exports.default = UiMenuSettings;
        /***/ }),
    /* 301 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let UiTooltip_1 = __webpack_require__(275);
        let Debug = __webpack_require__(192);
        const Sanitize = __webpack_require__(330).default;
        let debug = Debug('Game:Ui/UiPartyIcons');
        class UiPartyIcons extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-party-icons\" class=\"hud-party-icons\">\n            <div class=\"hud-party-member is-empty\" data-index=\"0\"></div>\n            <div class=\"hud-party-member is-empty\" data-index=\"1\"></div>\n            <div class=\"hud-party-member is-empty\" data-index=\"2\"></div>\n            <div class=\"hud-party-member is-empty\" data-index=\"3\"></div>\n        </div>");
                this.iconElems = [];
                this.rawIconElements = this.componentElem.querySelectorAll('.hud-party-member');
                for (let i = 0; i < this.rawIconElements.length; i++) {
                    this._loop_1(i);
                }
                this.ui.on('partyMembersUpdated', this.onPartyMembersUpdate.bind(this));
            }
            _loop_1(i) {
                this.iconElems[i] = this.rawIconElements[i];
                this.iconElems[i].addEventListener('click', this.onIconClick(i).bind(this));
                new UiTooltip_1.default(this.iconElems[i], (elem) => {
                    const playerData = this.partyMembers[i];
                    const displayName = Sanitize(playerData.displayName);
                    return "<div class=\"hud-tooltip-party\">\n                    <h4>" + displayName + "</h4>\n                    <h5>" + (playerData.isLeader === 1 ? 'Leader' : 'Member') + "</h5>\n                </div>";
                });
            };
            update() {
                for (const i in this.iconElems) {
                    let iconElem = this.iconElems[i];
                    let playerData = this.partyMembers[i];
                    if (!playerData) {
                        iconElem.classList.add('is-empty');
                        iconElem.innerHTML = "";
                        continue;
                    }
                    iconElem.classList.remove('is-empty');
                    iconElem.innerHTML = "<span>" + playerData.displayName.substr(0, 2) + "</span>";
                    if (playerData.isLeader === 1) {
                        iconElem.classList.add('is-leader');
                    } else {
                        iconElem.classList.remove('is-leader');
                    }
                }
            };
            onIconClick(i) {
                return (event) => {
                    let buildingOverlay = this.ui.getComponent('BuildingOverlay');
                    let placementOverlay = this.ui.getComponent('PlacementOverlay');
                    let spellOverlay = this.ui.getComponent('SpellOverlay');
                    let menuParty = this.ui.getComponent('MenuParty');
                    let menuShop = this.ui.getComponent('MenuShop');
                    event.stopPropagation();
                    buildingOverlay.stopWatching();
                    placementOverlay.cancelPlacing();
                    spellOverlay.cancelCasting();
                    menuShop.hide();
                    menuParty.show();
                    menuParty.setTab('Members');
                };
            };
            onPartyMembersUpdate(partyMembers) {
                this.partyMembers = partyMembers;
                this.update();
            };
        }
        exports.default = UiPartyIcons;
        /***/ }),
    /* 302 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiPipOverlay');
        class UiPipOverlay extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-pip-overlay\" class=\"hud-pip-overlay\"></div>");
                this.resourceGainElems = {};
                this.damageElems = {};
                this.lastPlayerTick = { wood: 0, stone: 0, gold: 0, token: 0 };
                this.lastPetWoodGain = 0;
                this.lastPetStoneGain = 0;
                this.ui.on('playerTickUpdate', this.onPlayerTickUpdate.bind(this));
                this.ui.on('playerDidDamage', this.onPlayerDidDamage.bind(this));
                this.ui.on('petDidDamage', this.onPetDidDamage.bind(this));
                this.ui.on('petGainedWood', this.onPetGainedWood.bind(this));
                this.ui.on('petGainedStone', this.onPetGainedStone.bind(this));
            }
            showResourceGain(uid, resourceName, value) {
                if (Math.abs(value) < 0.5) return;
                value = Math.round(value);
                let resourceGainElemId = Math.round(Math.random() * 10000);
                let resourceGainElem = this.ui.createElement("<div class=\"hud-pip-resource-gain\">" + (value > 0 ? '+' + value.toLocaleString() : value.toLocaleString()) + " " + resourceName + "</div>");
                let networkEntity = Game_1.default.currentGame.world.getEntityByUid(uid);
                if (!networkEntity) return;
                let renderer = Game_1.default.currentGame.renderer;
                let screenPos = renderer.worldToScreen(networkEntity.getPositionX(), networkEntity.getPositionY());
                this.componentElem.appendChild(resourceGainElem);
                resourceGainElem.style.left = (screenPos.x - resourceGainElem.offsetWidth / 2) + 'px';
                resourceGainElem.style.top = (screenPos.y - resourceGainElem.offsetHeight - 70 + Object.keys(this.resourceGainElems).length * 16) + 'px';
                this.resourceGainElems[resourceGainElemId] = resourceGainElem;
                setTimeout(() => {
                    resourceGainElem.remove();
                    delete this.resourceGainElems[resourceGainElemId];
                }, 500);
            };
            showDamage(uid, value) {
                value = Math.round(value);
                let damageElemId = Math.round(Math.random() * 10000);
                let damageElem = this.ui.createElement("<div class=\"hud-pip-damage\">" + value.toLocaleString() + "</div>");
                let networkEntity = Game_1.default.currentGame.world.getEntityByUid(uid);
                if (!networkEntity) return;
                let renderer = Game_1.default.currentGame.renderer;
                let screenPos = renderer.worldToScreen(networkEntity.getPositionX(), networkEntity.getPositionY());
                this.componentElem.appendChild(damageElem);
                damageElem.style.left = (screenPos.x - damageElem.offsetWidth / 2) + 'px';
                damageElem.style.top = (screenPos.y - damageElem.offsetHeight - 10) + 'px';
                this.damageElems[damageElemId] = damageElem;
                setTimeout(() => {
                    damageElem.remove();
                    delete this.damageElems[damageElemId];
                }, 500);
            };
            onPlayerTickUpdate(playerTick) {
                if (playerTick.wood !== this.lastPlayerTick.wood) {
                    let delta = playerTick.wood - this.lastPlayerTick.wood;
                    if (delta !== this.lastPetWoodGain) {
                        !window.disablepopups && this.showResourceGain(playerTick.uid, 'wood', delta);
                    }
                }
                if (playerTick.stone !== this.lastPlayerTick.stone) {
                    let delta = playerTick.stone - this.lastPlayerTick.stone;
                    if (delta !== this.lastPetStoneGain) {
                        !window.disablepopups && this.showResourceGain(playerTick.uid, 'stone', delta);
                    }
                }
                if (playerTick.gold !== this.lastPlayerTick.gold) {
                    let delta = playerTick.gold - this.lastPlayerTick.gold;
                    if (delta < 0) {
                        !window.disablepopups && this.showResourceGain(playerTick.uid, 'gold', delta);
                    }
                }
                if (playerTick.token !== this.lastPlayerTick.token) {
                    !window.disablepopups && this.showResourceGain(playerTick.uid, 'tokens', playerTick.token - this.lastPlayerTick.token);
                }
                this.lastPlayerTick = playerTick;
                this.lastPetWoodGain = 0;
                this.lastPetStoneGain = 0;
            };
            onPlayerDidDamage(playerTick) {
                this.showDamage(playerTick.lastDamageTarget, playerTick.lastDamage);
            };
            onPetDidDamage(playerTick) {
                this.showDamage(playerTick.lastPetDamageTarget, playerTick.lastPetDamage);
            };
            onPetGainedWood(petTick) {
                this.lastPetWoodGain = petTick.woodGain;
                !window.disablepopups && this.showResourceGain(petTick.uid, 'wood', petTick.woodGain);
            };
            onPetGainedStone(petTick) {
                this.lastPetStoneGain = petTick.stoneGain;
                !window.disablepopups && this.showResourceGain(petTick.uid, 'stone', petTick.stoneGain);
            };
        }
        exports.default = UiPipOverlay;
        /***/ }),
    /* 303 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let TextEntity_1 = __webpack_require__(209);
        let PlacementIndicatorModel_1 = __webpack_require__(222);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiPlacementOverlay');
        let BuildingDirection = {0: 'UP', 1: 'RIGHT', 2: 'DOWN', 3: 'LEFT', UP: 0, RIGHT: 1, DOWN: 2, LEFT: 3};
        class UiPlacementOverlay extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<span></span>");
                this.placeholderTints = [];
                this.borderTints = [];
                this.direction = BuildingDirection.UP;
                this.disableDirection = true;
                this.maxPlayerDistance = 12;
                this.maxStashDistance = 18;
                this.minWallDistance = 4;
                this.placeholderText = new TextEntity_1.default("", "Hammersmith One", 16);
                this.placeholderText.setAnchor(0.5, 0.5);
                this.placeholderText.setColor(220, 220, 220);
                this.placeholderText.setStroke(51, 51, 51, 3);
                this.placeholderText.setFontWeight('bold');
                this.placeholderText.setLetterSpacing(1);
                this.placeholderText.setAlpha(0);
                this.placeholderText.setPosition(-1000, -1000);
                Game_1.default.currentGame.renderer.ui.addAttachment(this.placeholderText);
                Game_1.default.currentGame.renderer.on('cameraUpdate', this.onCameraUpdate.bind(this));
            }
            isActive() {
                return !!this.buildingId;
            };
            getBuildingId() {
                return this.buildingId;
            };
            update() {
                if (!this.buildingId) return;
                let buildingSchema = this.ui.getBuildingSchema();
                let schemaData = buildingSchema[this.buildingId];
                let mousePosition = this.ui.getMousePosition();
                let world = Game_1.default.currentGame.world;
                let worldPos = Game_1.default.currentGame.renderer.screenToWorld(mousePosition.x, mousePosition.y);
                let cellIndexes = world.entityGrid.getCellIndexes(worldPos.x, worldPos.y, { width: schemaData.gridWidth, height: schemaData.gridHeight });
                let cellSize = world.entityGrid.getCellSize();
                let cellAverages = { x: 0, y: 0 };
                for (let i = 0; i < cellIndexes.length; i++) {
                    if (!cellIndexes[i]) {
                        this.placeholderTints[i].setVisible(false);
                        continue;
                    }
                    let cellPos = world.entityGrid.getCellCoords(cellIndexes[i]);
                    let gridPos_1 = {
                        x: cellPos.x * cellSize + cellSize / 2,
                        y: cellPos.y * cellSize + cellSize / 2
                    };
                    let isOccupied = this.checkIsOccupied(cellIndexes[i], cellPos);
                    this.placeholderTints[i].setPosition(gridPos_1.x, gridPos_1.y);
                    this.placeholderTints[i].setIsOccupied(isOccupied);
                    this.placeholderTints[i].setVisible(true);
                    cellAverages.x += cellPos.x;
                    cellAverages.y += cellPos.y;
                }
                cellAverages.x = cellAverages.x / cellIndexes.length;
                cellAverages.y = cellAverages.y / cellIndexes.length;
                let gridPos = {
                    x: cellAverages.x * cellSize + cellSize / 2,
                    y: cellAverages.y * cellSize + cellSize / 2
                };
                this.gridPos = gridPos;
                this.placeholderEntity.setPosition(gridPos.x, gridPos.y);
                let uiPos = Game_1.default.currentGame.renderer.worldToUi(gridPos.x, gridPos.y);
                this.placeholderText.setPosition(uiPos.x, uiPos.y - 110);
            };
            startPlacing(buildingId) {
                if (this.buildingId) this.cancelPlacing();
                this.buildingId = buildingId;
                this.goldStash = null;
                let buildingSchema = this.ui.getBuildingSchema();
                let buildings = this.ui.getBuildings();
                let schemaData = buildingSchema[buildingId];
                if (this.buildingId == "Harvester" || this.buildingId == "MeleeTower") {
                    this.disableDirection = false;
                    this.placeholderText.setAlpha(0.75);
                    this.placeholderText.setPosition(-1000, -1000);
                } else {
                    this.disableDirection = true;
                    this.placeholderText.setAlpha(0);
                    this.placeholderText.setPosition(-1000, -1000);
                }
                this.goldStash = Object.values(buildings)[0];
                let world = Game_1.default.currentGame.world;
                let cellSize = world.entityGrid.getCellSize();
                let totalCellsUsed = schemaData.gridWidth * schemaData.gridHeight;
                this.placeholderEntity = Game_1.default.currentGame.assetManager.loadModel(schemaData.modelName, {});
                this.placeholderEntity.setAlpha(0.5);
                this.placeholderEntity.setRotation(this.disableDirection ? 0 : this.direction * 90);
                Game_1.default.currentGame.renderer.entities.addAttachment(this.placeholderEntity);
                for (let i = 0; i < totalCellsUsed; i++) {
                    this.placeholderTints[i] = new PlacementIndicatorModel_1.default({width: cellSize, height: cellSize});
                    Game_1.default.currentGame.renderer.entities.addAttachment(this.placeholderTints[i]);
                }
                for (let i = 0; i < 4; i++) {
                    let halfWallDistance = this.minWallDistance / 2;
                    if (i == 0 || i == 1) {
                        this.borderTints[i] = new PlacementIndicatorModel_1.default({width: cellSize * this.minWallDistance, height: cellSize * world.entityGrid.getRows()});
                    } else if (i == 2 || i == 3) {
                        this.borderTints[i] = new PlacementIndicatorModel_1.default({width: cellSize * (world.entityGrid.getColumns() - this.minWallDistance * 2), height: cellSize * this.minWallDistance});
                    }
                    Game_1.default.currentGame.renderer.ground.addAttachment(this.borderTints[i]);
                    if (i == 0) {
                        this.borderTints[i].setPosition(cellSize * 2, cellSize * (world.entityGrid.getRows() / 2));
                    } else if (i == 1) {
                        this.borderTints[i].setPosition(cellSize * (world.entityGrid.getColumns() - 2), cellSize * (world.entityGrid.getRows() / 2));
                    } else if (i == 2) {
                        this.borderTints[i].setPosition(cellSize * (world.entityGrid.getColumns() / 2), cellSize * 2);
                    } else if (i == 3) {
                        this.borderTints[i].setPosition(cellSize * (world.entityGrid.getColumns() / 2), cellSize * (world.entityGrid.getRows() - 2));
                    }
                    this.borderTints[i].setIsOccupied(true);
                }
                this.update();
            };
            placeBuilding() {
                if (!this.buildingId) return;
                let localPlayer = Game_1.default.currentGame.world.getLocalPlayer();
                if (!localPlayer) return false;
                let localEntity = localPlayer.getEntity();
                if (!localEntity) return false;
                let buildingSchema = this.ui.getBuildingSchema();
                let schemaData = buildingSchema[this.buildingId];
                let mousePosition = this.ui.getMousePosition();
                let world = Game_1.default.currentGame.world;
                let worldPos = Game_1.default.currentGame.renderer.screenToWorld(mousePosition.x, mousePosition.y);
                let cellIndexes = world.entityGrid.getCellIndexes(worldPos.x, worldPos.y, { width: schemaData.gridWidth, height: schemaData.gridHeight });
                let cellSize = world.entityGrid.getCellSize();
                let cellAverages = { x: 0, y: 0 };
                for (let i = 0; i < cellIndexes.length; i++) {
                    if (!cellIndexes[i]) return false;
                    let cellPos = world.entityGrid.getCellCoords(cellIndexes[i]);
                    let isOccupied = this.checkIsOccupied(cellIndexes[i], cellPos);
                    cellAverages.x += cellPos.x;
                    cellAverages.y += cellPos.y;
                }
                cellAverages.x = cellAverages.x / cellIndexes.length;
                cellAverages.y = cellAverages.y / cellIndexes.length;
                let gridPos = {
                    x: cellAverages.x * cellSize + cellSize / 2,
                    y: cellAverages.y * cellSize + cellSize / 2
                };
                Game_1.default.currentGame.network.sendRpc({name: 'MakeBuilding', x: gridPos.x, y: gridPos.y, type: this.buildingId, yaw: this.disableDirection ? 0 : this.direction * 90});
                if (schemaData.built + 1 >= schemaData.limit) this.cancelPlacing();
                return true;
            };
            cancelPlacing() {
                if (!this.buildingId) return;
                Game_1.default.currentGame.renderer.entities.removeAttachment(this.placeholderEntity);
                for (let i = 0; i < this.placeholderTints.length; i++) {
                    Game_1.default.currentGame.renderer.entities.removeAttachment(this.placeholderTints[i]);
                }
                for (let i = 0; i < this.borderTints.length; i++) {
                    Game_1.default.currentGame.renderer.ground.removeAttachment(this.borderTints[i]);
                }
                this.placeholderText.setAlpha(0);
                this.placeholderText.setPosition(-1000, -1000);
                this.placeholderEntity = null;
                this.placeholderTints = [];
                this.borderTints = [];
                this.buildingId = null;
            };
            cycleDirection() {
                if (this.disableDirection) return;
                if (this.buildingId == "Harvester" || this.buildingId == "MeleeTower") {
                    this.direction = (this.direction + 1) % 4;
                    this.placeholderEntity && this.placeholderEntity.setRotation(this.direction * 90);
                }
            };
            checkIsOccupied(cellIndex, cellPos) {
                let world = Game_1.default.currentGame.world;
                let cellSize = world.entityGrid.getCellSize();
                let entities = world.entityGrid.getEntitiesInCell(cellIndex);
                let gridPos = {
                    x: cellPos.x * cellSize + cellSize / 2,
                    y: cellPos.y * cellSize + cellSize / 2
                };
                if (!entities) return true;
                let buildings = 0;
                entities.forEach((e, uid) => {
                    let networkEntity = world.getEntityByUid(parseInt(uid));
                    if (networkEntity && networkEntity.getTargetTick()) {
                        buildings += networkEntity.entityClass !== 'Projectile' ? 1 : 0;
                    }
                })
                if (buildings > 0) return true;
                let wallDistanceX = Math.min(cellPos.x, world.entityGrid.getColumns() - 1 - cellPos.x);
                let wallDistanceY = Math.min(cellPos.y, world.entityGrid.getRows() - 1 - cellPos.y);
                if (wallDistanceX < this.minWallDistance || wallDistanceY < this.minWallDistance) return true;
                let localPlayer = world.getLocalPlayer();
                if (localPlayer) {
                    let localEntity = localPlayer.getEntity();
                    if (localEntity) {
                        let cellDistanceX = Math.abs(localEntity.getPositionX() - gridPos.x) / cellSize;
                        let cellDistanceY = Math.abs(localEntity.getPositionY() - gridPos.y) / cellSize;
                        if (cellDistanceX > this.maxPlayerDistance || cellDistanceY > this.maxPlayerDistance) return true;
                    }
                }
                if (this.goldStash && this.buildingId !== 'Harvester') {
                    let cellDistanceX = Math.abs(this.goldStash.x - gridPos.x) / cellSize;
                    let cellDistanceY = Math.abs(this.goldStash.y - gridPos.y) / cellSize;
                    if (cellDistanceX > this.maxStashDistance || cellDistanceY > this.maxStashDistance) return true;
                }
                return false;
            };
            onCameraUpdate() {
                this.update();
            };
        }
        exports.default = UiPlacementOverlay;
        /***/ }),
    /* 304 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiPopupOverlay');
        class UiPopupOverlay extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-popup-overlay\" class=\"hud-popup-overlay\"></div>");
                this.popupElems = {};
                this.popupTimers = {};
                this.popupMessages = {};
            }
            showHint(message, timeoutInMs = 8000, icon) {
                /*
                for (let popupId_1 in this.popupMessages) {
                    if (this.popupMessages[popupId_1] == message) {
                        //return false;
                    }
                }
                */
                let popupId = Math.round(Math.random() * 100000000);
                let popupElem = this.ui.createElement("<div class=\"hud-popup-message hud-popup-hint is-visible\">" + message + "</div>");
                if (icon) {
                    popupElem.classList.add('has-icon');
                    popupElem.appendChild(this.ui.createElement("<span class=\"hud-popup-icon\" style=\"background-image:url('" + icon + "');\"></span>"));
                }
                this.componentElem.appendChild(popupElem);
                this.popupElems[popupId] = popupElem;
                this.popupTimers[popupId] = setTimeout(() => {
                    this.removePopup(popupId);
                }, timeoutInMs);
                this.popupMessages[popupId] = message;
                return popupId;
            };
            showConfirmation(message, timeoutInMs = 30000, acceptCallback, declineCallback) {
                let popupId = Math.round(Math.random() * 100000000);
                let popupElem = this.ui.createElement("<div class=\"hud-popup-message hud-popup-confirmation is-visible\">\n            <span>" + message + "</span>\n            <div class=\"hud-confirmation-actions\">\n                <a class=\"btn btn-green hud-confirmation-accept\">Yes</a>\n                <a class=\"btn hud-confirmation-decline\">No</a>\n            </div>\n        </div>");
                this.componentElem.appendChild(popupElem);
                this.popupElems[popupId] = popupElem;
                let acceptElem = popupElem.querySelector('.hud-confirmation-accept');
                let declineElem = popupElem.querySelector('.hud-confirmation-decline');
                acceptElem.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.removePopup(popupId);
                    if (acceptCallback) {
                        acceptCallback();
                    }
                });
                declineElem.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.removePopup(popupId);
                    if (declineCallback) {
                        declineCallback();
                    }
                });
                this.popupTimers[popupId] = setTimeout(() => {
                    this.removePopup(popupId);
                }, timeoutInMs);
                return popupId;
            };
            removePopup(popupId) {
                let popupElem = this.popupElems[popupId];
                if (!popupElem) return;
                if (this.popupTimers[popupId]) {
                    clearInterval(this.popupTimers[popupId]);
                }
                popupElem.classList.remove('is-visible');
                setTimeout(() => {
                    popupElem.remove();
                    delete this.popupElems[popupId];
                    delete this.popupTimers[popupId];
                    delete this.popupMessages[popupId];
                }, 500)
            };
        }
        exports.default = UiPopupOverlay;
        /***/ }),
    /* 305 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiPrerollAd');
        class UiPrerollAd extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-preroll-ad\" class=\"hud-preroll-ad\"></div>");
            }
        }
        exports.default = UiPrerollAd;
        /***/ }),
    /* 306 */
    /***/ (function(module, exports, __webpack_require__) {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiReconnect');
        class UiReconnect extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-reconnect\" class=\"hud-reconnect\">\n            <div class=\"hud-reconnect-wrapper\">\n                <div class=\"hud-reconnect-main\">\n                    <span class=\"hud-loading\"></span>\n                    <p>You lost connection to the server, attempting to reconnect...</p><br>\n<button class='reconnect' onclick='game.network.reconnect(1);' style='font-family: \"Hammersmith One\", sans-serif'>Reconnect?</button>\n               </div>\n            </div>\n        </div>");
            }
        }
        exports.default = UiReconnect;
        /***/ }),
    /* 307 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiResources');
        class UiResources extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-resources\" class=\"hud-resources\">\n            <div class=\"hud-resources-resource hud-resources-wood\">0</div>\n            <div class=\"hud-resources-resource hud-resources-stone\">0</div>\n            <div class=\"hud-resources-resource hud-resources-gold\">0</div>\n            <div class=\"hud-resources-resource hud-resources-tokens\">0</div>\n            <div class=\"hud-resources-wave\">&mdash;</div>\n        </div>");
                this.lastPlayerTick = {
                    wood: 0,
                    stone: 0,
                    gold: 0,
                    token: 0,
                    wave: 0
                };
                this.woodElem = this.componentElem.querySelector('.hud-resources-wood');
                this.stoneElem = this.componentElem.querySelector('.hud-resources-stone');
                this.goldElem = this.componentElem.querySelector('.hud-resources-gold');
                this.tokensElem = this.componentElem.querySelector('.hud-resources-tokens');
                this.waveElem = this.componentElem.querySelector('.hud-resources-wave');
                this.ui.on('playerTickUpdate', this.onPlayerTickUpdate.bind(this));
            }
            onPlayerTickUpdate(playerTick) {
                let walkthrough = this.ui.getComponent('Walkthrough');
                if (playerTick.wood !== this.lastPlayerTick.wood) {
                    this.woodElem.innerHTML = this.numberAbbreviate(playerTick.wood);
                }
                if (playerTick.stone !== this.lastPlayerTick.stone) {
                    this.stoneElem.innerHTML = this.numberAbbreviate(playerTick.stone);
                }
                if (playerTick.gold !== this.lastPlayerTick.gold) {
                    this.goldElem.innerHTML = this.numberAbbreviate(playerTick.gold);
                }
                if (playerTick.token !== this.lastPlayerTick.token) {
                    this.tokensElem.innerHTML = this.numberAbbreviate(playerTick.token);
                }
                if (playerTick.wave > 0 && playerTick.wave !== this.lastPlayerTick.wave) {
                    this.waveElem.innerHTML = playerTick.wave.toLocaleString();
                }
                if (playerTick.wood >= 10 && playerTick.stone >= 10) {
                    walkthrough.markStepAsCompleted(1);
                }
                this.lastPlayerTick = playerTick;
            };
            numberAbbreviate(e = 0) {
                return e <= 999.5 ? Math.round(e) + "" : e <= 999500 ? Math.round(e/1e2)/10 + "K" : e <= 999500000 ? Math.round(e/1e5)/10 + "M" : e <= 999500000000 ? Math.round(e/1e8)/10 + "B" : e <= 999500000000000 ? Math.round(e/1e11)/10 + "T" : "Many";
            }
        }
        exports.default = UiResources;
        /***/ }),
    /* 308 */
    /***/ (function(module, exports) {

        /***/ }),
    /* 309 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiRespawn');
        class UiRespawn extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-respawn\" class=\"hud-respawn\">\n            <div class=\"hud-respawn-wrapper\">\n                <div class=\"hud-respawn-main\">\n                    </div>\n                    <div class=\"hud-respawn-info\">\n                        <h2>Oh dear...</h2>\n                        <p class=\"hud-respawn-text\"></p>\n                                                                                                       </div>\n                        <button type=\"submit\" class=\"hud-respawn-btn\" style=\"font-family: 'Hammersmith One', sans-serif\">Respawn</button>\n                    </div>\n                </div>\n            </div>\n            <div class=\"hud-respawn-corner-bottom-left\">\n                                </div>\n            </div>\n        </div>");
                this.medrecId = 2000;
                this.respawnTextElem = this.componentElem.querySelector('.hud-respawn-text');
                this.submitElem = this.componentElem.querySelector('.hud-respawn-btn');
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.submitElem.addEventListener('click', this.onRespawnClick.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('Dead', this.onPlayerDeath.bind(this));
            }
            show() {
                super.show.call(this);
            };
            hide() {
                super.hide.call(this);
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
            onRespawnClick(event) {
                let menuShop = this.ui.getComponent('MenuShop');
                Game_1.default.currentGame.inputPacketScheduler.scheduleInput({respawn: 1});
                setTimeout(() => {
                    menuShop.checkSocialLinks();
                }, 2000);
                this.hide();
            };
            onPlayerDeath(response) {
                let localPlayerEntity = Game_1.default.currentGame.world.getEntityByUid(Game_1.default.currentGame.world.getMyUid());
                let localPlayerTick = localPlayerEntity.getTargetTick();
                this.deadResponse = response;
                this.lastTick = localPlayerTick;
                if (!this.deadResponse.stashDied) {
                    this.respawnTextElem.innerHTML = "You got killed... but fear not &mdash; your fortress survives! Now go get some pussy";
                } else {
                    this.respawnTextElem.innerHTML = `Your gold stash was destroyed after <strong>${localPlayerTick.wave}</strong> ${localPlayerTick.wave === 1 ? "wave" : "waves"}, with a final score of <strong>${localPlayerTick.score.toLocaleString()}</strong>.`;
                }
                this.show();
            };
        }
        exports.default = UiRespawn;
        /***/ }),
    /* 310 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiShieldBar');
        class UiShieldBar extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-shield-bar\" class=\"hud-shield-bar\">\n            <div class=\"hud-shield-bar-inner\" style=\"width:100%;\"></div>\n        </div>");
                this.lastPlayerTick = { zombieShieldHealth: 0, zombieShieldMaxHealth: 0 };
                this.barElem = this.componentElem.querySelector('.hud-shield-bar-inner');
                this.ui.on('playerTickUpdate', this.onPlayerTickUpdate.bind(this));
            }
            onPlayerTickUpdate(playerTick) {
                if (playerTick.zombieShieldMaxHealth === null || playerTick.zombieShieldMaxHealth === 0) {
                    this.hide();
                    this.lastPlayerTick = playerTick;
                    return;
                }
                if (playerTick.zombieShieldHealth !== this.lastPlayerTick.zombieShieldHealth || playerTick.zombieShieldMaxHealth !== this.lastPlayerTick.zombieShieldMaxHealth) {
                    let shieldPercentage = Math.round(playerTick.zombieShieldHealth / playerTick.zombieShieldMaxHealth * 100);
                    this.barElem.style.width = shieldPercentage + '%';
                }
                this.show();
                this.lastPlayerTick = playerTick;
            };
        }
        exports.default = UiShieldBar;
        /***/ }),
    /* 311 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let UiTooltip_1 = __webpack_require__(275);
        let Util_1 = __webpack_require__(213);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiSpellIcons');
        class UiSpellIcons extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-spell-icons\" class=\"hud-spell-icons\">\n            <div class=\"hud-spell-icon is-disabled\" data-type=\"HealTowersSpell\">\n                <h4>Heal Towers</h4>\n                <h5>Spell</h5>\n                <div class=\"hud-spell-icon-cooldown\">\n                    <span class=\"hud-spell-icon-cooldown-left\"></span>\n                    <span class=\"hud-spell-icon-cooldown-right\"></span>\n                </div>\n                <div class=\"hud-tooltip-body\">\n                    <p>Heals your towers over time in an area of effect.</p>\n                </div>\n            </div>\n            <div class=\"hud-spell-icon\" data-type=\"TimeoutItem\">\n                <h4>Timeout</h4>\n                <h5>Utility</h5>\n                <div class=\"hud-spell-icon-cooldown\">\n                    <span class=\"hud-spell-icon-cooldown-left\"></span>\n                    <span class=\"hud-spell-icon-cooldown-right\"></span>\n                </div>\n                <div class=\"hud-tooltip-body\">\n                    <p>Prevent zombies from spawning for one day-night cycle.</p>\n                </div>\n</div>\n            <div class=\"hud-spell-icon\" data-type=\"TimeoutNowItem\">\n                <h4>Timeout Now</h4>\n                <h5>Utility</h5>\n                <div class=\"hud-spell-icon-cooldown\">\n                    <span class=\"hud-spell-icon-cooldown-left\"></span>\n                    <span class=\"hud-spell-icon-cooldown-right\"></span>\n                </div>\n                <div class=\"hud-tooltip-body\">\n                    <p>Prevent zombies from spawning for one day-night cycle.</p>\n                </div>\n            </div>\n        </div>");
                this.iconElems = {};
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.rawIconElements = this.componentElem.querySelectorAll('.hud-spell-icon');
                for (let i = 0; i < this.rawIconElements.length; i++) {
                    this._loop_1(i);
                }
                this.ui.on('wavePaused', this.onWavePaused.bind(this));
                this.ui.on('inventoryUpdate', this.onInventoryUpdate.bind(this));
                this.ui.on('spellSchemaUpdate', this.onSpellSchemaUpdate.bind(this));
                Game_1.default.currentGame.network.addRpcHandler('CastSpellResponse', this.onCastSpellResponse.bind(this));
            }
            _loop_1(i) {
                let type = this.rawIconElements[i].getAttribute('data-type');
                this.iconElems[type] = this.rawIconElements[i];
                this.iconElems[type].addEventListener('click', this.onIconClick(type).bind(this));
                new UiTooltip_1.default(this.iconElems[type], (elem) => {
                    let costsHtml = Util_1.default.createResourceCostString({});
                    if (type === 'TimeoutItem' || type === 'TimeoutNowItem') {
                        let itemSchema = this.ui.getItemSchema();
                        let schemaData = itemSchema.Pause;
                        costsHtml = Util_1.default.createResourceCostString(schemaData);
                    } else {
                        let spellSchema = this.ui.getSpellSchema();
                        let schemaData = spellSchema[type];
                        if (!schemaData.cooldownTiers) {
                            return "<div class=\"hud-tooltip-spell-icon\">\n                            " + this.iconElems[type].innerHTML + "\n                            <div class=\"hud-tooltip-body hud-resource-low\">Temporarily Disabled</div>\n                        </div>";
                        }
                        costsHtml = Util_1.default.createResourceCostString(schemaData);
                    }
                    return "<div class=\"hud-tooltip-spell-icon\">\n                    " + this.iconElems[type].innerHTML + "\n                    <div class=\"hud-tooltip-body\">\n                        " + costsHtml + "\n                    </div>\n                </div>";
                }, 'right');
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
            onIconClick(type) {
                return function (event) {
                    var iconElem = this.iconElems[type];
                    if (iconElem.classList.contains('is-disabled') || iconElem.classList.contains('is-on-cooldown')) {
                        return;
                    }
                    if (type === 'HealTowersSpell') {
                        this.useHealSpell();
                    }
                    else if (type === 'TimeoutItem' || type === 'TimeoutNowItem') {
                        this.useTimeoutItem();
                    }
                };
            };
            useHealSpell() {
                let buildingOverlay = this.ui.getComponent('BuildingOverlay');
                let placementOverlay = this.ui.getComponent('PlacementOverlay');
                let spellOverlay = this.ui.getComponent('SpellOverlay');
                buildingOverlay.stopWatching();
                placementOverlay.cancelPlacing();
                spellOverlay.startCasting('HealTowersSpell');
            };
            useTimeoutItem() {
                Game_1.default.currentGame.network.sendRpc({name: 'BuyItem', itemName: 'Pause', tier: 1});
            };
            onWavePaused() {
                let itemSchema = this.ui.getItemSchema();
                let schemaData = itemSchema.Pause;
                this.startCooldownForIcon('TimeoutItem', schemaData.purchaseCooldown);
            };
            onInventoryUpdate() {
                var inventory = this.ui.getInventory();
                if (!inventory.Pause || inventory.Pause.stacks === 0) {
                    this.iconElems.TimeoutItem.classList.remove('is-disabled');
                }
                else {
                    this.iconElems.TimeoutItem.classList.add('is-disabled');
                }
            };
            onSpellSchemaUpdate() {
                let spellSchema = this.ui.getSpellSchema();
                for (const spellId in spellSchema) {
                    if (spellSchema[spellId].cooldownTiers) {
                        this.iconElems[spellId].classList.remove('is-disabled');
                    }
                }
            };
            onCastSpellResponse(response) {
                let startTimestamp = performance.now() - Math.max(0, Game_1.default.currentGame.world.getReplicator().getMsSinceTick(response.cooldownStartTick));
                this.startCooldownForIcon(response.spell, response.cooldown, startTimestamp);
            };
            startCooldownForIcon(type, duration, startTimestamp = null) {
                var currentAngle = 0;
                var cooldownLeftElem = this.iconElems[type].querySelector('.hud-spell-icon-cooldown-left');
                var cooldownRightElem = this.iconElems[type].querySelector('.hud-spell-icon-cooldown-right');
                this.iconElems[type].classList.add('is-on-cooldown');
                cooldownLeftElem.style.backgroundImage = 'linear-gradient(90deg, rgba(0, 0, 0, 0.2) 50%, transparent 50%)';
                cooldownRightElem.style.backgroundImage = 'linear-gradient(-90deg, rgba(0, 0, 0, 0.2) 50%, transparent 50%)';
                let animateCooldown = (timestamp) => {
                    if (!startTimestamp) {
                        startTimestamp = timestamp;
                    }
                    var currentAngle = (timestamp - startTimestamp) / duration * 360;
                    if (currentAngle > 180) {
                        cooldownLeftElem.style.backgroundImage = 'linear-gradient(' + (currentAngle - 90) + 'deg, rgba(0, 0, 0, 0.2) 50%, transparent 50%)';
                        cooldownRightElem.style.backgroundImage = 'linear-gradient(90deg, rgba(0, 0, 0, 0.2) 50%, transparent 50%)';
                    }
                    else {
                        cooldownLeftElem.style.backgroundImage = 'linear-gradient(90deg, rgba(0, 0, 0, 0.2) 50%, transparent 50%)';
                        cooldownRightElem.style.backgroundImage = 'linear-gradient(' + (currentAngle - 90) + 'deg, rgba(0, 0, 0, 0.2) 50%, transparent 50%)';
                    }
                    if (currentAngle > 360) {
                        this.iconElems[type].classList.remove('is-on-cooldown');
                        return;
                    }
                    requestAnimationFrame(animateCooldown);
                };
                requestAnimationFrame(animateCooldown);
            };
        }
        exports.default = UiSpellIcons;
        /***/ }),
    /* 312 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let SpellIndicatorModel_1 = __webpack_require__(240);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiSpellOverlay');
        class UiSpellOverlay extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<span></span>");
                Game_1.default.currentGame.renderer.on('cameraUpdate', this.onCameraUpdate.bind(this));
            }
            isActive() {
                return !!this.spellId;
            };
            getSpellId() {
                return this.spellId;
            };
            update() {
                if (!this.spellId) return;
                let mousePosition = this.ui.getMousePosition();
                let worldPos = Game_1.default.currentGame.renderer.screenToWorld(mousePosition.x, mousePosition.y);
                let uiPos = Game_1.default.currentGame.renderer.worldToUi(worldPos.x, worldPos.y);
                this.spellIndicatorModel.setPosition(uiPos.x, uiPos.y);
            };
            startCasting(spellId) {
                if (this.spellId) this.cancelCasting();
                this.spellId = spellId;
                let spellSchema = this.ui.getSpellSchema();
                let schemaData = spellSchema[spellId];
                let mousePosition = this.ui.getMousePosition();
                let worldPos = Game_1.default.currentGame.renderer.screenToWorld(mousePosition.x, mousePosition.y);
                let uiPos = Game_1.default.currentGame.renderer.worldToUi(worldPos.x, worldPos.y);
                this.spellIndicatorModel = new SpellIndicatorModel_1.default({radius: schemaData.rangeTiers[0] / 2});
                this.spellIndicatorModel.setPosition(uiPos.x, uiPos.y);
                Game_1.default.currentGame.renderer.ui.addAttachment(this.spellIndicatorModel);
                this.update();
            };
            castSpell() {
                if (!this.spellId || !Game_1.default.currentGame.world.getLocalPlayer() || !Game_1.default.currentGame.world.localPlayer.getEntity()) return;
                let mousePosition = this.ui.getMousePosition();
                let worldPos = Game_1.default.currentGame.renderer.screenToWorld(mousePosition.x, mousePosition.y);
                Game_1.default.currentGame.network.sendRpc({name: 'CastSpell', spell: this.spellId, x: Math.round(worldPos.x), y: Math.round(worldPos.y), tier: 1});
                this.cancelCasting();
            };
            cancelCasting() {
                if (!this.spellId) return;
                Game_1.default.currentGame.renderer.ui.removeAttachment(this.spellIndicatorModel);
                this.spellIndicatorModel = null;
                this.spellId = null;
            };
            onCameraUpdate() {
                this.update();
            };
        }
        exports.default = UiSpellOverlay;
        /***/ }),
    /* 313 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let UiToolbarItem_1 = __webpack_require__(314);
        let UiToolbarBuilding_1 = __webpack_require__(315);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiToolbar');
        class UiToolbar extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-toolbar\" class=\"hud-toolbar\">\n            <div class=\"hud-toolbar-inventory\"></div>\n            <div class=\"hud-toolbar-buildings\"></div>\n        </div>");
                this.toolbarInventory = {};
                this.toolbarBuildings = {};
                this.inventoryElem = this.componentElem.querySelector('.hud-toolbar-inventory');
                this.buildingsElem = this.componentElem.querySelector('.hud-toolbar-buildings');
                var buildingSchema = this.ui.getBuildingSchema();
                var itemSchema = this.ui.getItemSchema();
                for (let itemId in itemSchema) {
                    if (!itemSchema[itemId].onToolbar) {
                        continue;
                    }
                    this.toolbarInventory[itemId] = new UiToolbarItem_1.default(this.ui, itemId);
                    this.toolbarInventory[itemId].on('equipOrUseItem', this.onTriggerEquipOrUseItem.bind(this));
                    this.inventoryElem.appendChild(this.toolbarInventory[itemId].getComponentElem());
                }
                for (let buildingId in buildingSchema) {
                    this.toolbarBuildings[buildingId] = new UiToolbarBuilding_1.default(this.ui, buildingId);
                    this.toolbarBuildings[buildingId].on('startPlacingBuilding', this.onStartPlacingBuilding.bind(this));
                    this.toolbarBuildings[buildingId].on('placeBuilding', this.onPlaceBuilding.bind(this));
                    this.buildingsElem.appendChild(this.toolbarBuildings[buildingId].getComponentElem());
                }
            }
            onTriggerEquipOrUseItem(itemId, itemTier) {
                let equipItemRpc = {
                    name: 'EquipItem',
                    itemName: itemId,
                    tier: itemTier
                };
                Game_1.default.currentGame.network.sendRpc(equipItemRpc);
                this.ui.emit('itemEquippedOrUsed', itemId, itemTier);
            };
            onStartPlacingBuilding(buildingId) {
                let buildingOverlay = this.ui.getComponent('BuildingOverlay');
                let placementOverlay = this.ui.getComponent('PlacementOverlay');
                let spellOverlay = this.ui.getComponent('SpellOverlay');
                buildingOverlay.stopWatching();
                spellOverlay.cancelCasting();
                placementOverlay.startPlacing(buildingId);
            };
            onPlaceBuilding() {
                let placementOverlay = this.ui.getComponent('PlacementOverlay');
                placementOverlay.placeBuilding();
            };
        }
        exports.default = UiToolbar;
        /***/ }),
    /* 314 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiTooltip_1 = __webpack_require__(275);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiToolbarItem');
        class UiToolbarItem extends UiComponent_1.default {
            constructor(ui, itemId) {
                super(ui, "<a class=\"hud-toolbar-item\" data-item=\"" + itemId + "\"></a>");
                this.itemId = itemId;
                this.tooltip = new UiTooltip_1.default(this.componentElem, this.onTooltipCreate.bind(this));
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.ui.on('itemSchemaUpdate', this.onItemSchemaUpdate.bind(this));
                this.ui.on('inventoryUpdate', this.onInventoryUpdate.bind(this));
                this.update();
            }
            update() {
                let itemSchema = this.ui.getItemSchema();
                let itemInventory = this.ui.getInventory();
                let schemaData = itemSchema[this.itemId];
                let inventoryData = itemInventory[this.itemId];
                this.componentElem.setAttribute('data-tier', inventoryData ? inventoryData.tier.toString() : '1');
                if (inventoryData && inventoryData.stacks > 0) {
                    this.componentElem.classList.remove('is-empty');
                }
                else {
                    this.componentElem.classList.add('is-empty');
                }
            };
            onTooltipCreate() {
                let itemSchema = this.ui.getItemSchema();
                let itemInventory = this.ui.getInventory();
                let schemaData = itemSchema[this.itemId];
                let inventoryData = itemInventory[this.itemId];
                let itemTier = 1;
                if (inventoryData) {
                    itemTier = inventoryData.tier;
                }
                return "<div class=\"hud-tooltip-toolbar\">\n            <h2>" + schemaData.name + "</h2>\n            <h3>Tier " + itemTier + " Item</h3>\n            <div class=\"hud-tooltip-body\">\n                " + schemaData.description + "\n            </div>\n        </div>";
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                let itemInventory = this.ui.getInventory();
                let inventoryData = itemInventory[this.itemId];
                let itemTier = 1;
                if (inventoryData) {
                    itemTier = inventoryData.tier;
                }
                event.stopPropagation();
                this.emit('equipOrUseItem', this.itemId, itemTier);
            };
            onItemSchemaUpdate() {
                this.update();
            };
            onInventoryUpdate() {
                this.update();
            };
        }
        exports.default = UiToolbarItem;


        /***/ }),
    /* 315 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let Util_1 = __webpack_require__(213);
        let UiTooltip_1 = __webpack_require__(275);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiToolbarBuilding');
        class UiToolbarBuilding extends UiComponent_1.default {
            constructor(ui, buildingId) {
                super(ui, "<a class=\"hud-toolbar-building\" data-building=\"" + buildingId + "\" draggable=\"true\"></a>");
                this.buildingId = buildingId;
                this.tooltip = new UiTooltip_1.default(this.componentElem, this.onTooltipCreate.bind(this));
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.componentElem.addEventListener('dragstart', this.onDragStart.bind(this));
                this.componentElem.addEventListener('drag', this.onDrag.bind(this));
                this.componentElem.addEventListener('dragend', this.onDragEnd.bind(this));
                this.ui.on('buildingsUpdate', this.onBuildingsUpdate.bind(this));
                this.ui.on('buildingSchemaUpdate', this.onBuildingSchemaUpdate.bind(this));
                this.update();
            }
            update() {
                var buildingSchema = this.ui.getBuildingSchema();
                var schemaData = buildingSchema[this.buildingId];
                if (schemaData.key) {
                    this.componentElem.setAttribute('data-key', schemaData.key.toString());
                }
                if (schemaData.disabled) {
                    this.componentElem.classList.add('is-disabled');
                }
                else {
                    this.componentElem.classList.remove('is-disabled');
                }
            };
            onTooltipCreate() {
                var buildingSchema = this.ui.getBuildingSchema();
                var schemaData = buildingSchema[this.buildingId];
                var costsHtml = Util_1.default.createResourceCostString(schemaData);
                var builtHtml = "";
                if (schemaData.built >= schemaData.limit) {
                    builtHtml = "<strong class=\"hud-resource-low\">" + schemaData.built + "</strong>/" + schemaData.limit;
                }
                else {
                    builtHtml = "<strong>" + schemaData.built + "</strong>/" + schemaData.limit;
                }
                return "<div class=\"hud-tooltip-toolbar\">\n            <h2>" + schemaData.name + "</h2>\n            <h3>Tier 1 Building</h3>\n            <span class=\"hud-tooltip-built\">" + builtHtml + "</span>\n            <div class=\"hud-tooltip-body\">\n                " + schemaData.description + "\n            </div>\n            <div class=\"hud-tooltip-body\">\n                " + costsHtml + "\n            </div>\n        </div>";
            };
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
                if (this.componentElem.classList.contains('is-disabled')) {
                    return;
                }
                this.emit('startPlacingBuilding', this.buildingId);
            };
            onDragStart(event) {
                var dataTransfer = event.dataTransfer;
                var blankIcon = document.createElement('img');
                dataTransfer.setDragImage(blankIcon, 0, 0);
                this.emit('startPlacingBuilding', this.buildingId);
                this.tooltip.hide();
            };
            onDrag(event) {
                Game_1.default.currentGame.inputManager.emit('mouseMoved', event);
            };
            onDragEnd(event) {
                event.preventDefault();
                this.emit('placeBuilding');
            };
            onBuildingsUpdate() {
                this.update();
            };
            onBuildingSchemaUpdate() {
                this.update();
            };
        }
        exports.default = UiToolbarBuilding;
        /***/ }),
    /* 316 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiWalkthrough');
        class UiWalkthrough extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<span></span>");
                this.hasCompleted = {};
                this.stepPopupIds = {};
                this.currentStep = 1;
                this.inWalkthrough = false;
                this.steps = {
                    '1': {
                        message: 'Start off by gathering some resources. Collect <strong>10 wood and stone</strong> using <strong>WASD</strong> keys and harvesting with <strong>Left Click</strong>.',
                        icon: `./asset/pictures/gold-mine/entities-gold-mine.svg`
                    },
                    '2': {
                        message: 'Now you\'re ready to place down your <strong>Gold Stash</strong> &mdash; once you establish your base <strong>zombies will start spawning each night</strong>.',
                        icon: `./asset/pictures/gold-stash/entities-gold-stash.svg`
                    },
                    '3': {
                        message: 'You\'re ready to start building your defenses! Start by using the <strong>5 wood</strong> you gathered earlier to place an <strong>Arrow Tower</strong> from the toolbar below.',
                        icon: `./asset/pictures/arrow-tower/entities-arrow-tower.svg`
                    },
                    '4': {
                        message: 'Now you\'re protected you should start generating gold. Do this by building a <strong>Gold Mine</strong> from the toolbar &mdash; this will passively give your entire party gold.',
                        icon: `./asset/pictures/gold-mine/entities-gold-mine.svg`
                    }
                };
                Game_1.default.currentGame.network.addEnterWorldHandler(this.onEnterWorld.bind(this));
            }
            restart() {
                let popupOverlay = this.ui.getComponent('PopupOverlay');
                if ('localStorage' in window) {
                    window.localStorage.removeItem('walkthroughCompleted');
                }
                this.currentStep = 1;
                this.inWalkthrough = true;
                this.stepPopupIds[this.currentStep] = popupOverlay.showHint(this.steps[this.currentStep].message, 30000, this.steps[this.currentStep].icon);
            };
            markStepAsCompleted(step) {
                let popupOverlay = this.ui.getComponent('PopupOverlay');
                if (!this.inWalkthrough || this.hasCompleted[step]) {
                    return;
                }
                this.hasCompleted[step] = true;
                if (step !== this.currentStep) {
                    return;
                }
                if (this.stepPopupIds[this.currentStep]) {
                    popupOverlay.removePopup(this.stepPopupIds[this.currentStep]);
                }
                if (Object.keys(this.hasCompleted).length === Object.keys(this.steps).length) {
                    window.localStorage.setItem('walkthroughCompleted', 'true');
                    return;
                }
                this.currentStep = null;
                for (let i in this.steps) {
                    if (!this.hasCompleted[i]) {
                        this.currentStep = parseInt(i);
                        break;
                    }
                }
                if (!this.currentStep) {
                    window.localStorage.setItem('walkthroughCompleted', 'true');
                    return;
                }
                this.stepPopupIds[this.currentStep] = popupOverlay.showHint(this.steps[this.currentStep].message, 30000, this.steps[this.currentStep].icon);
            };
            onEnterWorld(data) {
                if (!data.allowed || !('localStorage' in window) || window.localStorage.getItem('walkthroughCompleted') == 'true') return;
                this.restart();
            };
        }
        exports.default = UiWalkthrough;
        /***/ }),
    /* 317 */
    /***/ ((module, exports) => {

        module.exports = {
            "Wall": {
                "name": "Wall",
                "description": "Blocks enemies from reaching your towers.",
                "key": "1",
                "modelName": "WallModel",
                "gridWidth": 1,
                "gridHeight": 1,
                "tiers": 1,
                "built": 0,
                "limit": 250,
                "disabled": true
            },
            "Door": {
                "name": "Door",
                "description": "Allows party members to enter your base.",
                "key": "2",
                "modelName": "DoorModel",
                "gridWidth": 1,
                "gridHeight": 1,
                "tiers": 1,
                "built": 0,
                "limit": 40,
                "disabled": true
            },
            "SlowTrap": {
                "name": "Slow Trap",
                "description": "Slows enemies from entering your base.",
                "key": "3",
                "modelName": "SlowTrapModel",
                "gridWidth": 1,
                "gridHeight": 1,
                "tiers": 1,
                "built": 0,
                "limit": 12,
                "disabled": true
            },
            "ArrowTower": {
                "name": "Arrow Tower",
                "description": "Single target, fast firing tower.",
                "key": "4",
                "modelName": "ArrowTowerModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 6,
                "disabled": true
            },
            "CannonTower": {
                "name": "Cannon Tower",
                "description": "Area of effect damage, slow firing tower.",
                "key": "5",
                "modelName": "CannonTowerModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 6,
                "disabled": true
            },
            "MeleeTower": {
                "name": "Melee Tower",
                "description": "High damage, single target, close-range directional tower.",
                "key": "6",
                "modelName": "MeleeTowerModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 6,
                "disabled": true
            },
            "BombTower": {
                "name": "Bomb Tower",
                "description": "Large area of effect damage, very slow firing tower.",
                "key": "7",
                "modelName": "BombTowerModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 6,
                "disabled": true
            },
            "MagicTower": {
                "name": "Mage Tower",
                "description": "Multiple projectile, short range, fast firing tower.",
                "key": "8",
                "modelName": "MageTowerModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 6,
                "disabled": true
            },
            "GoldMine": {
                "name": "Gold Mine",
                "description": "Generates gold every second for your party. Gold gain is multiplied by the number of players in your party.",
                "key": "9",
                "modelName": "GoldMineModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 8,
                "disabled": true
            },
            "Harvester": {
                "name": "Resource Harvester",
                "description": "Harvests resources automatically, fuelled by gold. Hit with a pickaxe to collect.",
                "key": "0",
                "modelName": "HarvesterModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 2,
                "disabled": true
            },
            "GoldStash": {
                "name": "Gold Stash",
                "description": "Establishes your base and holds your gold. Protect this!",
                "modelName": "GoldStashModel",
                "gridWidth": 2,
                "gridHeight": 2,
                "tiers": 1,
                "built": 0,
                "limit": 1
            }
        };

        /***/ }),
    /* 318 */
    /***/ ((module, exports) => {

        module.exports = {
            "Pickaxe": {
                "name": "Pickaxe",
                "type": "Weapon",
                "description": "Harvests stone and wood.",
                "tiers": 1,
                "onToolbar": true,
                "onBuffBar": false,
                "canPurchase": true
            },
            "Spear": {
                "name": "Spear",
                "type": "Weapon",
                "description": "Melee weapon with high attack speed.",
                "tiers": 1,
                "onToolbar": true,
                "onBuffBar": false,
                "canPurchase": true
            },
            "Bow": {
                "name": "Bow",
                "type": "Weapon",
                "description": "Ranged weapon with high damage.",
                "tiers": 1,
                "onToolbar": true,
                "onBuffBar": false,
                "canPurchase": true
            },
            "Bomb": {
                "name": "Bomb",
                "type": "Weapon",
                "description": "Ranged AOE weapon with fuse delay.",
                "tiers": 1,
                "onToolbar": true,
                "onBuffBar": false,
                "canPurchase": true
            },
            "ZombieShield": {
                "name": "Shield",
                "type": "Armor",
                "description": "Protects you from zombies.",
                "tiers": 1,
                "onToolbar": false,
                "onBuffBar": true,
                "canPurchase": true
            },
            "HatHorns": {
                "name": "Horns",
                "type": "Hat",
                "description": "Makes you look cool... I think?",
                "tiers": 1,
                "onToolbar": false,
                "onBuffBar": false,
                "canPurchase": true
            },
            "PetCARL": {
                "name": "C. A. R. L",
                "type": "Pet",
                "description": "Willing to fight by your side in close-range combat.",
                "tiers": 1,
                "onToolbar": false,
                "onBuffBar": false,
                "canPurchase": true
            },
            "PetMiner": {
                "name": "Woody",
                "type": "Pet",
                "description": "Harvests resources for you!",
                "tiers": 1,
                "onToolbar": false,
                "onBuffBar": false,
                "canPurchase": true
            },
            "HealthPotion": {
                "name": "Health Potion",
                "type": "Utility",
                "description": "Heals your player to full health.",
                "tiers": 1,
                "onToolbar": true,
                "onBuffBar": false,
                "canPurchase": true
            },
            "PetHealthPotion": {
                "name": "Pet Potion",
                "type": "Utility",
                "description": "Heals your pet to full health.",
                "tiers": 1,
                "onToolbar": true,
                "onBuffBar": false,
                "canPurchase": true
            },
            "PetWhistle": {
                "name": "Pet Whistle",
                "type": "Utility",
                "description": "Blowing this whistle calls your pet back to you.",
                "tiers": 1,
                "onToolbar": true,
                "onBuffBar": false,
                "canPurchase": false
            },
            "PetRevive": {
                "name": "Pet Revive",
                "type": "Utility",
                "description": "Revive your pet for a small fee...",
                "tiers": 1,
                "onToolbar": false,
                "onBuffBar": false,
                "canPurchase": false
            },
            "Pause": {
                "name": "Timeout",
                "type": "Utility",
                "description": "Prevents zombies from spawning for one day-night cycle. Has a short cooldown.",
                "tiers": 1,
                "onToolbar": false,
                "onBuffBar": true,
                "canPurchase": false
            },
            "Invulnerable": {
                "name": "Invulnerable",
                "type": "Utility",
                "description": "You are temporarily immune to damage from any sources.",
                "tiers": 1,
                "onToolbar": false,
                "onBuffBar": true,
                "canPurchase": false
            }
        };

        /***/ }),
    /* 319 */
    /***/ ((module, exports) => {

        module.exports = {
            "HealTowersSpell": {
                "name": "Heal Towers",
                "tiers": 1
            }
        };

        /***/ }),
    /* 320 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Game_1 = __webpack_require__(1);
        let World_1 = __webpack_require__(257);
        let EntityGrid_1 = __webpack_require__(321);
        let GroundEntity_1 = __webpack_require__(249);
        let SpriteEntity_1 = __webpack_require__(198);
        class World extends World_1.default {
            constructor() {
                super();
                this.isInitialized = false;
            }
            init() {
                super.init.call(this);
                Game_1.default.currentGame.network.addEnterWorldHandler((data) => {
                    if (!data.allowed || this.isInitialized) {
                        return;
                    }
                    let groundEntity = new GroundEntity_1.default();
                    let grassTexture = new SpriteEntity_1.default("/asset/pictures/map/map-grass.png", true);
                    let winterSnowfallTexture = new SpriteEntity_1.default("/asset/pictures/map/map-winter-snowfall.png", true);
                    groundEntity.addAttachment(grassTexture);
                    groundEntity.addAttachment(winterSnowfallTexture);
                    grassTexture.setDimensions(1, 1, this.width, this.height);
                    grassTexture.setAnchor(0, 0);
                    grassTexture.setAlpha(0.5);
                    winterSnowfallTexture.setDimensions(1, 1, this.width, this.height);
                    winterSnowfallTexture.setAnchor(0, 0);
                    winterSnowfallTexture.setAlpha(0.62);
                    this.renderer.add(groundEntity);
                    this.isInitialized = true;
                });
            };
            onEnterWorld(data) {
                super.onEnterWorld.call(this, data);
                this.entityGrid = new EntityGrid_1.default(this.width, this.height, 48);
            };
            createEntity(data) {
                super.createEntity.call(this, data);
                this.entityGrid.updateEntity(this.entities.get(data.uid));
            };
            updateEntity(uid, data) {
                super.updateEntity.call(this, uid, data);
                this.entityGrid.updateEntity(this.entities.get(uid));
            };
            removeEntity(uid) {
                super.removeEntity.call(this, uid);
                this.entityGrid.removeEntity(parseInt(uid));
            };
        }
        exports.default = World;
        /***/ }),
    /* 321 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let entities = __webpack_require__(248);
        class EntityGrid {
            constructor(width, height, cellSize) {
                this.cellEntities = [];
                this.entityMap = {};
                this.oneGridSize = { width: 1, height: 1 };
                this.width = width;
                this.height = height;
                this.cellSize = cellSize;
                this.rows = (this.height / this.cellSize) | 0;
                this.columns = (this.width / this.cellSize) | 0;
                this.totalCells = this.rows * this.columns;
                for (let i = 0; i < this.totalCells; i++) {
                    this.cellEntities[i] = new Map();
                }
            }
            getEntitiesInCell(index) {
                return this.cellEntities[index];
            };
            updateEntity(entity) {
                let gridSize = this.oneGridSize;
                let tick = entity.getTargetTick();
                if (tick && 'model' in tick) {
                    let entityData = entities[tick.model];
                    if (entityData && 'gridSize' in entityData) {
                        gridSize = entityData.gridSize;
                    }
                }
                let cellIndexes = this.getCellIndexes(entity.getPositionX(), entity.getPositionY(), gridSize);
                if (!(entity.uid in this.entityMap)) {
                    this.addEntityToCells(entity.uid, cellIndexes);
                    return;
                }
                let isDirty = this.entityMap[entity.uid].length !== cellIndexes.length || !this.entityMap[entity.uid].every((element, i) => element === cellIndexes[i]);
                if (isDirty) {
                    this.removeEntityFromCells(entity.uid, this.entityMap[entity.uid]);
                    this.addEntityToCells(entity.uid, cellIndexes);
                }
            };
            removeEntity(uid) {
                this.removeEntityFromCells(uid, this.entityMap[uid]);
            };
            getCellIndex(x, y) {
                return this.columns * ((y / this.cellSize) | 0) + (x / this.cellSize) | 0;
            }
            getCellIndexes(x, y, gridSize) {
                let indexes = [];
                for (let xOffset = -gridSize.width / 2 + 0.5; xOffset < gridSize.width / 2; xOffset++) {
                    for (let yOffset = -gridSize.height / 2 + 0.5; yOffset < gridSize.height / 2; yOffset++) {
                        let index = this.getCellIndex(x + xOffset * this.cellSize, y + yOffset * this.cellSize);
                        index > 0 && index < this.totalCells ? indexes.push(index) : indexes.push(false);
                    }
                }
                return indexes;
            };
            getCellCoords(index) {
                return {
                    x: index % this.columns,
                    y: index / this.columns | 0
                };
            };
            getCellSize() {
                return this.cellSize;
            };
            getRows() {
                return this.rows;
            };
            getColumns() {
                return this.columns;
            };
            removeEntityFromCells(uid, indexes) {
                if (indexes) {
                    for (let i = 0; i < indexes.length; i++) {
                        indexes[i] && this.cellEntities[indexes[i]].delete(uid);
                    }
                }
                delete this.entityMap[uid];
            };
            addEntityToCells(uid, indexes) {
                for (let i = 0; i < indexes.length; i++) {
                    indexes[i] && this.cellEntities[indexes[i]].set(uid, true);
                }
                this.entityMap[uid] = indexes;
            };
        }
        exports.default = EntityGrid;
        /***/ }),
    /* 322 */
    /***/ ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let Renderer_1 = __webpack_require__(245);
        class Renderer extends Renderer_1.default {
            constructor() {
                super('localStorage' in window && window.localStorage.getItem('forceCanvas') === 'true');
            }
        }
        exports.default = Renderer;
        /***/ }),
    /* 323 */
    /***/ (function(module, exports, __webpack_require__) {
        /***/ }),
    /* 324 */
    /***/ (function(module, exports) {
        /***/ }),
    /* 325 */
    /***/ (function(module, exports) {
        /***/ }),
    /* 326 */
    /***/ (function(module, exports) {
        /***/ }),
    /* 327 */
    /***/ (function(module, exports) {
        /***/ }),
    /* 328 */
    /***/ (function(module, exports) {
        /***/ }),
    /* 329 */
    /***/ ((module, exports, __webpack_require__) => {
        /***/ }),
    /* 330 */
    /***/ ((module, exports) => {
        const notAllowedCharsInHTML = new Map([["<", '&lt;'], [">", '&gt;']]);
        const Sanitize = (e) => {
            let text = "";
            for (let i = 0; i < e.length; i++) {
                notAllowedCharsInHTML.has(e[i]) ? text += notAllowedCharsInHTML.get(e[i]) : text += e[i];
            }
            return text;
        }
        exports.default = Sanitize;
        /***/ }),
    /* 331 */
    ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiMenuFPS');
        class UiMenuFPS extends UiComponent_1.default {
            constructor(ui) {
                super(ui, "<div id=\"hud-menu-FPS\" class=\"hud-menu hud-menu-FPS\">\n            <a class=\"hud-menu-close\"></a>\n            <h3>Score Logs</h3>\n            <div class=\"hud-FPS-grid\">\n                    <div class=\"hud-FPS-hidden-controls\"><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Disable Tower Sprite Entity</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Disable Tower Entity</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Disable Projectile Entity</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Disable Zombie Sprite Entity (Excluding Bosses)</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Disable Zombie Entity (Excluding Bosses)</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Stop Rendering</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Show 200x200 Grid</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Hide Ground</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Show 7x7 Grid</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Show Stash Placement</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Show Stash Range</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Show Spawn Circle</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Use Blue T6 Textures</a><a class=\"hud-FPS-restart-walkthrough btn btn-green\">Use Default Zombies</a></div>\n      </div>");
                this.closeElem = this.componentElem.querySelector('.hud-menu-close');
                this.gridElem = this.componentElem.querySelector('.hud-FPS-grid');
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.closeElem.addEventListener('click', this.hide.bind(this));
            }
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
        }
        exports.default = UiMenuFPS;
    }),
    ((module, exports, __webpack_require__) => {
        Object.defineProperty(exports, "__esModule", { value: true });
        let UiComponent_1 = __webpack_require__(272);
        let Debug = __webpack_require__(192);
        let debug = Debug('Game:Ui/UiMenuScripts');
        class UiMenuScripts extends UiComponent_1.default {
            constructor(ui) {
                super(ui, `<div id=\"hud-menu-Scripts\" class=\"hud-menu hud-menu-Scripts\">\n   <a class=\"hud-menu-close\"></a>\n   <div style="text-align:center">      <div class="mxyz">~ xyz ~</div>\n            <div class="hud-Scripts-grid">\n     <div style="text-align:center">      <span>Scripts...</span>\n<br><br><br>\n </div>`);
                this.closeElem = this.componentElem.querySelector('.hud-menu-close');
                this.gridElem = this.componentElem.querySelector('.hud-Scripts-grid');
                this.componentElem.addEventListener('mousedown', this.onMouseDown.bind(this));
                this.componentElem.addEventListener('mouseup', this.onMouseUp.bind(this));
                this.closeElem.addEventListener('click', this.hide.bind(this));
            }
            onMouseDown(event) {
                event.stopPropagation();
            };
            onMouseUp(event) {
                event.stopPropagation();
            };
        }
        exports.default = UiMenuScripts;
    })
]);