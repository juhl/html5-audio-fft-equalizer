function FFT(size) {
    var half_size = size / 2;
    this.size = size;
    this.bit_reverse_table = new Uint32Array(size);
    this.cos_table = new Float32Array(half_size);
    this.sin_table = new Float32Array(half_size);
    this.re = new Float32Array(size);
    this.im = new Float32Array(size);

    var bits = parseInt(Math.log(size) * Math.LOG2E + 0.001);
    var half_bits = parseInt(bits / 2);

    for (var i = 0; i < size; i++) {
        var rindex = 0;
        var shift = bits - 1;

        for (var b = 0; b <= half_bits; b++) {
            rindex |= (i >> shift) & (1 << b);
            rindex |= (i << shift) & ((1 << (bits - 1)) >> b);

            shift -= 2;
        }

        this.bit_reverse_table[i] = rindex;
    }

    for (var i = 0; i < half_size; i++) {
        var f = 2 * Math.PI * i / size;
        this.cos_table[i] = Math.cos(f);
        this.sin_table[i] = Math.sin(f);
    }
}

FFT.prototype.forward = function(data, stride, stride_offset, re, im) {
    if (stride == undefined) stride = 1;
    if (stride_offset == undefined) stride_offset = 0;

    for (var i = 0; i < this.size; i++) {
        this.re[i] = data[this.bit_reverse_table[i] * stride + stride_offset];
        this.im[i] = 0;
    }
    
    for (var depth = 0; ; depth++) {
        var b_count = this.size >> (depth + 1);
        var b_group = 1 << depth;

        for (var j = 0; j < b_count; j++) {
            var base = b_group * 2 * j;

            for (var i = 0; i < b_group; i++) {
                var pair = [base + i, base + i + b_group];

                var y_re = this.re[pair[0]];
                var y_im = this.im[pair[0]];

                var z_re = this.re[pair[1]];
                var z_im = this.im[pair[1]];

                var k = b_count * i;
                var ck = this.cos_table[k];
                var sk = this.sin_table[k];

                var wz_re = z_re * ck + z_im * sk;
                var wz_im = z_im * ck - z_re * sk;

                this.re[pair[0]] = y_re + wz_re;
                this.im[pair[0]] = y_im + wz_im;

                this.re[pair[1]] = y_re - wz_re;
                this.im[pair[1]] = y_im - wz_im;
            }
        }

        if (b_count == 1) {
            break;
        }
    }

    var inv_size = 1.0 / this.size;
    for (var i = 0; i < this.size; i++) {
        re[i] = this.re[i] * inv_size;
        im[i] = this.im[i] * inv_size;
    }
}

FFT.prototype.inverse = function(re, im, data, stride, stride_offset) {
    if (stride == undefined) stride = 1;
    if (stride_offset == undefined) stride_offset = 0;

    for (var i = 0; i < this.size; i++) {
        var rindex = this.bit_reverse_table[i];
        
        this.re[i] = re[rindex];
        this.re[rindex] = re[i];

        this.im[i] = im[rindex];
        this.im[rindex] = im[i];
    }

    for (var depth = 0; ; depth++) {
        var b_count = this.size >> (depth + 1);
        var b_group = 1 << depth;

        for (var j = 0; j < b_count; j++) {
            var base = b_group * 2 * j;

            for (var i = 0; i < b_group; i++) {
                var pair = [base + i, base + i + b_group];

                var y_re = this.re[pair[0]];
                var y_im = this.im[pair[0]];

                var z_re = this.re[pair[1]];
                var z_im = this.im[pair[1]];

                var k = b_count * i;
                var ck = this.cos_table[k];
                var sk = this.sin_table[k];

                var wz_re = z_re * ck - z_im * sk;
                var wz_im = z_im * ck + z_re * sk;

                this.re[pair[0]] = y_re + wz_re;
                this.im[pair[0]] = y_im + wz_im;

                this.re[pair[1]] = y_re - wz_re;
                this.im[pair[1]] = y_im - wz_im;
            }
        }

        if (b_count == 1) {
            break;
        }
    }

    for (var i = 0; i < this.size; i++) {
        data[i * stride + stride_offset] = this.re[i];
    }
}