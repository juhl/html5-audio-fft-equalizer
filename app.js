App = function() {
    var EQ_COUNT = 10;
    var EQ_BAND_COUNT = 10;
    var eq = [];
    var selected_eq;
    var i_audio; // input audio
    var o_audio; // output audio
    var channels;
    var sample_rate;
    var frame_buffer_size;
    var source_buffer;
    var source_buffer_write_offset = 0;
    var target_buffers = [];
    var overlap_buffer;
    var overlap_buffer_write_offset = 0;
    var completion_buffer;
    var fft_re = [];
    var fft_im = [];
    var canvas;
    var ctx;
    var fft;

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

    function hsvToRgb(h, s, v){
        var r, g, b;

        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);

        switch (i % 6){
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
        }

        return [parseInt(r * 255), parseInt(g * 255), parseInt(b * 255)];
    }

    function triangular_window(x) {
        return 1 - Math.abs(1 - 2 * x);
    }

    function cosine_window(x) {
        return Math.cos(Math.PI * x - Math.PI / 2);
    }

    function hamming_window(x) {
        return 0.54 - 0.46 * Math.cos(2 * Math.PI * x);
    }

    function hann_window(x) {
        return 0.5 * (1 - Math.cos(2 * Math.PI * x));
    }

    function window(buffer, size, stride, stride_offset) {
        for (var i = 0; i < size; i++) {
            buffer[i * stride + stride_offset] *= hamming_window(i / (size - 1));
            //buffer[i * stride + stride_offset] *= triangular_window(i / (size - 1));
            //buffer[i * stride + stride_offset] *= cosine_window(i / (size - 1));
            //buffer[i * stride + stride_offset] *= hann_window(i / (size - 1));
        }
    }

    function butterworth_filter(x, n, d0) {
        return 1 / (1 + Math.pow(Math.abs(x) / d0, 2 * n));
    }

    function eq_filter(x) {
        var seq = eq[selected_eq];
        var sum = 1;
        for (var i = 0; i < EQ_BAND_COUNT; i++) {
            sum += seq[EQ_BAND_COUNT - 1 - i] * butterworth_filter(x * (2 << i) - 1, 2, 0.4);
        }
        return sum;
    }

    function audioAvailable(event) {
        source_buffer.set(event.frameBuffer, source_buffer_write_offset);

        var half_frame_buffer_size = frame_buffer_size / 2;
        var offset = [];
        offset[0] = source_buffer_write_offset - half_frame_buffer_size;
        offset[1] = offset[0] + half_frame_buffer_size;
        offset[2] = offset[1] + half_frame_buffer_size;
        if (offset[0] < 0)
            offset[0] += source_buffer.length;

        source_buffer_write_offset += frame_buffer_size;
        source_buffer_write_offset %= frame_buffer_size * 2;

        for (var i = 0; i < 2; i++) {
            target_buffers[i].set(source_buffer.subarray(offset[i + 0], offset[i + 0] + half_frame_buffer_size), 0);
            target_buffers[i].set(source_buffer.subarray(offset[i + 1], offset[i + 1] + half_frame_buffer_size), half_frame_buffer_size);

            for (var j = 0; j < channels; j++) {
                window(target_buffers[i], target_buffers[i].length / channels, channels, j);              

                fft.forward(target_buffers[i], channels, j, fft_re[j], fft_im[j]);

                for (var k = 0; k < fft.bufferSize / 2; k++) {
                    var f = eq_filter(k / (fft.bufferSize - 1));
                    fft_re[j][k] *= f;
                    fft_im[j][k] *= f;
                    fft_re[j][fft.bufferSize - 1 - k] *= f;
                    fft_im[j][fft.bufferSize - 1 - k] *= f;
                }
            }

            for (var j = 0; j < channels; j++) {
                fft.inverse(fft_re[j], fft_im[j], target_buffers[i], channels, j);
            }
        }

        var completion_offset = overlap_buffer_write_offset;

        for (var i = 0; i < 2; i++) {
            for (var j = 0; j < frame_buffer_size / 2; j++) {
                overlap_buffer[overlap_buffer_write_offset + j] += target_buffers[i][j];
            }

            overlap_buffer_write_offset += frame_buffer_size / 2;
            overlap_buffer_write_offset %= overlap_buffer.length;

            for (var j = 0; j < frame_buffer_size / 2; j++) {
                overlap_buffer[overlap_buffer_write_offset + j] = target_buffers[i][frame_buffer_size / 2 + j];
            }
        }

        completion_buffer = overlap_buffer.subarray(completion_offset, completion_offset + frame_buffer_size);
        o_audio.mozWriteAudio(completion_buffer);
    }

    function drawSpectrum() {
        if (!completion_buffer) {
            return;
        }

        // FFT to completion buffer for spectrum drawing
        for (var i = 0; i < channels; i++) {
            fft.forward(completion_buffer, channels, i, fft_re[i], fft_im[i]);
        }
        
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        var bar_width = 3;
        var bar_interval = 1;
        var scale = 100;

        for (var i = 0; i < fft.bufferSize / 2; i += 4) {
            var spectrum = 0;

            for (var j = 0; j < channels; j++) {
                var re = fft_re[j];
                var im = fft_im[j];
                for (var k = 0; k < 4; k++) {
                    spectrum += Math.sqrt(re[i + k] * re[i + k] + im[i + k] * im[i + k]);
                }
                spectrum += Math.sqrt(re[i] * re[i] + im[i] * im[i]);
                spectrum /= 4;
            }

            spectrum /= channels;
            spectrum *= scale;
            magnitude = spectrum * 256;

            var rgb = hsvToRgb(i / (fft.bufferSize / 2), 1, 1);

            ctx.fillStyle = "rgb(" + rgb.join(",") + ")";
            ctx.fillRect((bar_width + bar_interval) * i/4, canvas.height, bar_width, -magnitude);
        }
    }

    function loadedMetadata(event) {
        i_audio.volume = 0;
        i_audio.addEventListener('MozAudioAvailable', audioAvailable, false);
        o_audio.mozSetup(i_audio.mozChannels, i_audio.mozSampleRate);
        //o_audio.frameBufferSize = i_audio.mozFrameBufferLength;

        frame_buffer_size = i_audio.mozFrameBufferLength;
        channels = i_audio.mozChannels;
        sample_rate = i_audio.mozSampleRate;    

        source_buffer = new Float32Array(frame_buffer_size * 2);
        source_buffer_write_offset = 0;

        target_buffers[0] = new Float32Array(frame_buffer_size);
        target_buffers[1] = new Float32Array(frame_buffer_size);

        overlap_buffer = new Float32Array(frame_buffer_size * 2);
        overlap_buffer_write_offset = 0;

        var bufferSize = frame_buffer_size / channels;
        fft = new FFT(bufferSize);

        for (var i = 0; i < channels; i++) {
            fft_re[i] = new Float32Array(bufferSize);
            fft_im[i] = new Float32Array(bufferSize);
        }

        setInterval(drawSpectrum, 1000 / 24);
        console.log("haha");
    }
    
    function db_to_mag(db) {
        return Math.pow(10, db / 10);
    }

    function mag_to_db(mag) {
        return 10 * (Math.log(mag) / Math.log(10));
    }

    function main() {
        i_audio = document.getElementById("audio");
        i_audio.addEventListener('loadedmetadata', loadedMetadata, false);
        o_audio = new Audio();

        eq[0] = [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,  0.00,  0.00];
        eq[1] = [0.30, 0.30, 0.20, 0.05, 0.10, 0.10, 0.20, 0.25,  0.20,  0.10];
        eq[2] = [0.40, 0.30, 0.25, 0.20, 0.10, 0.00, 0.00, 0.00,  0.00,  0.00];
        eq[3] = [0.20, 0.15, 0.10, 0.00, 0.25, 0.15, 0.05, 0.10,  0.30,  0.35];
        eq[4] = [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00,  0.00,  0.00];
        eq[5] = [0.20, 0.15, 0.00, 0.15, 0.20, 0.10, 0.20, 0.25,  0.20,  0.25];
        eq[6] = [0.20, 0.10, 0.00, 0.20, 0.50, 0.50, 0.20, 0.00, -0.10, -0.20];
        eq[7] = [0.75, 0.65, 0.60, 0.50, 0.15, 0.25, 0.00, 0.25,  0.40,  0.54];
        eq[8] = [0.60, 0.50, 0.40, 0.30, 0.10, 0.20, 0.00, 0.30,  0.40,  0.50];
        eq[9] = [0.10, 0.40, 0.40, 0.20, 0.40, 0.40, 0.20, 0.10,  0.00, -0.20];

        selected_eq = 0;

        for (var i = 0; i < EQ_BAND_COUNT; i++) {
            var createSlider = function(index) {
                $("#slider" + index).slider({
                    min: -1.0, max: 2.0, step: 0.05, value: eq[0][index],
                    orientation: 'vertical',
                    slide: function(event, ui) { 
                        selected_eq = 0;
                        eq[0][index] = ui.value;
                        $("#combobox-equalizer").val({value: 0}); 
                    }
                });
            }(i);
        }

        $("#combobox-equalizer").val({value: 0}).change(function() { 
            for (var i = 0; i < EQ_COUNT; i++) {
                selected_eq = this.value;
                $("#slider" + i).slider({value: eq[selected_eq][i]});
            }
        });

        canvas = document.getElementById("spectrum");
        if (!canvas.getContext) {
		    alert("Couldn't get canvas object !");
	    }

	    ctx = canvas.getContext("2d");
    }

    return { main: main };
}();