function FFT(bufferSize) {
    this.bufferSize = bufferSize;
    this.bitReverseTable = new Uint32Array(bufferSize);
    this.cosTable = new Float32Array(bufferSize / 2);
    this.sinTable = new Float32Array(bufferSize / 2);
    this.re = new Float32Array(bufferSize);
    this.im = new Float32Array(bufferSize);

    var bits = parseInt(Math.log(bufferSize) * Math.LOG2E + 0.001);
    var half_bits = parseInt(bits / 2);

    for (var i = 0; i < bufferSize; i++) {
        var reverseIndex = 0;
        var shift = bits - 1;

        for (var b = 0; b <= half_bits; b++) {
            reverseIndex |= (i >> shift) & (1 << b);
            reverseIndex |= (i << shift) & ((1 << (bits - 1)) >> b);

            shift -= 2;
        }

        this.bitReverseTable[i] = reverseIndex;
    }

    var halfSize = bufferSize >> 1;
    for (var i = 0; i < halfSize; i++) {
        this.cosTable[i] = Math.cos(2 * Math.PI * i / bufferSize);
        this.sinTable[i] = Math.sin(2 * Math.PI * i / bufferSize);
    }
}

FFT.prototype.forward = function(data, stride, stride_offset, re, im) {
    for (var i = 0; i < this.bufferSize; i++) {
        this.re[i] = data[this.bitReverseTable[i] * stride + stride_offset];
        this.im[i] = 0;
    }
    
    for (var depth = 0; ; depth++) {
        var bcount = this.bufferSize >> (depth + 1);
        var bgroup = 1 << depth;

        for (var j = 0; j < bcount; j++) {
            var base = bgroup * 2 * j;

            for (var i = 0; i < bgroup; i++) {
                var pair = [base + i, base + i + bgroup];

                var y_re = this.re[pair[0]];
                var y_im = this.im[pair[0]];

                var z_re = this.re[pair[1]];
                var z_im = this.im[pair[1]];

                var k = bcount * i;
                var ck = this.cosTable[k];
                var sk = this.sinTable[k];

                var wz_re = z_re * ck + z_im * sk;
                var wz_im = z_im * ck - z_re * sk;

                this.re[pair[0]] = y_re + wz_re;
                this.im[pair[0]] = y_im + wz_im;

                this.re[pair[1]] = y_re - wz_re;
                this.im[pair[1]] = y_im - wz_im;
            }
        }

        if (bcount == 1) {
            break;
        }
    }

    var invN = 1.0 / this.bufferSize;
    for (var i = 0; i < this.bufferSize; i++) {
        re[i] = this.re[i] * invN;
        im[i] = this.im[i] * invN;
    }
}

FFT.prototype.inverse = function(re, im, data, stride, stride_offset) {
    for (var i = 0; i < this.bufferSize; i++) {
        var rindex = this.bitReverseTable[i];
        
        this.re[i] = re[rindex];
        this.re[rindex] = re[i];

        this.im[i] = im[rindex];
        this.im[rindex] = im[i];
    }

    for (var depth = 0; ; depth++) {
        var bcount = this.bufferSize >> (depth + 1);
        var bgroup = 1 << depth;

        for (var j = 0; j < bcount; j++) {
            var base = bgroup * 2 * j;

            for (var i = 0; i < bgroup; i++) {
                var pair = [base + i, base + i + bgroup];

                var y_re = this.re[pair[0]];
                var y_im = this.im[pair[0]];

                var z_re = this.re[pair[1]];
                var z_im = this.im[pair[1]];

                var k = bcount * i;
                var ck = this.cosTable[k];
                var sk = this.sinTable[k];

                var wz_re = z_re * ck - z_im * sk;
                var wz_im = z_im * ck + z_re * sk;

                this.re[pair[0]] = y_re + wz_re;
                this.im[pair[0]] = y_im + wz_im;

                this.re[pair[1]] = y_re - wz_re;
                this.im[pair[1]] = y_im - wz_im;
            }
        }

        if (bcount == 1) {
            break;
        }
    }

    for (var i = 0; i < this.bufferSize; i++) {
        data[i * stride + stride_offset] = this.re[i];
    }
}