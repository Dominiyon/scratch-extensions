/*
   This extension was made with TurboBuilder!
   https://turbobuilder-steel.vercel.app/
*/
(function (Scratch) {
	const cache = {};
	const blocks = [];
	const menus ={
        PAREMS: { 
			acceptReporters: false, 
			items: [
				'pan',
				'gain',
				{ text: 'loop point', value: 'loopb' },
				{ text: 'current sample', value: 'smp' },
				{ text: 'playback rate', value: 'inc' },
			] 
		}
    };


	const audioContext = window.AudioContext || window.webkitAudioContext;
	var ctx = new audioContext();
	var gainNode = ctx.createGain();
	gainNode.gain.value = 0.5;

	class Filter {
		constructor() {
			this.b0 = 1;
			this.b1 = 0;
			this.b2 = 0;
			this.a1 = 0;
			this.a2 = 0;
			this.z1 = 0;
			this.z2 = 0;
		}
		process(x) {
			let w = x - this.a1 * this.z1 - this.a2 * this.z2;
			let y = this.b0 * w + this.b1 * this.z1 + this.b2 * this.z2;
			this.z2 = this.z1;
			this.z1 = w;

			return y;
		}
		setCoefficients(b0, b1, b2, a1, a2) {
			this.b0 = b0;
			this.b1 = b1;
			this.b2 = b2;
			this.a1 = a1;
			this.a2 = a2;
		}
		setLowPass(cutoffFrequency, Q = 0.7071) { // i am NOT hand tweaking these coeficcents lmao
			const omega = 2 * Math.PI * cutoffFrequency / ctx.sampleRate;
			const cosOmega = Math.cos(omega);
			const sinOmega = Math.sin(omega);
			const alpha = sinOmega / (2 * Q);

			const b0_raw = (1 - cosOmega) / 2;
			const b1_raw = 1 - cosOmega;
			const b2_raw = (1 - cosOmega) / 2;
			const a0_raw = 1 + alpha;
			const a1_raw = -2 * cosOmega;
			const a2_raw = 1 - alpha;

			this.b0 = b0_raw / a0_raw;
			this.b1 = b1_raw / a0_raw;
			this.b2 = b2_raw / a0_raw;
			this.a1 = a1_raw / a0_raw;
			this.a2 = a2_raw / a0_raw;
		}
	}

	const bufferSize = ctx.sampleRate < 64000 ? 2048 : ctx.sampleRate < 128000 ? 4096 : 8192;
	const jsNode = ctx.createScriptProcessor(bufferSize, 0, 2);
	var dchannels = [{
		samples: [],
		pan: 0,
		gain: 0.5,
		stream: true,
		smp: -1,
		loopb: -1,
		inc: 1,
		filter: new Filter()
	}];
	jsNode.onaudioprocess = function (e) {
		var buflen = e.outputBuffer.length;
		var bufl = e.outputBuffer.getChannelData(0);
		var bufr = e.outputBuffer.getChannelData(1);
		var numCh = dchannels.length;
		for (var k = 0; k < buflen; k++) {
			var l = 0,
				r = 0;
			for (var i = 0; i < numCh; i++) {
				var ch = dchannels[i];
				ch.smp += ch.inc;
				if (ch.smp >= ch.samples.length) {
					if (ch.loopb !== -1 && !ch.stream) {
						ch.smp = ch.loopb
					} else {
						ch.smp = ch.samples.length
					}
				}
				if (ch.smp < 0) ch.smp = 0;

				var s = ch.samples[Math.floor(ch.smp)];
				if ((s ?? null) !== null) {
					s = ch.filter.process(s);
					var v = s * ch.gain;
					l += v * (1 - Math.max(ch.pan, 0));
					r += v * (1 + Math.min(ch.pan, 0));
				}
			}
			bufl[k] = l;
			bufr[k] = r;
		}
		dchannels.forEach(channel => {
			if (channel.stream) {
				channel.samples.splice(0, Math.floor(channel.smp) + 1);
				channel.smp -= Math.floor(channel.smp);
			}
		})
	};

	async function getSamples(url) {
		const response = await fetch(url);
		const arrayBuffer = await response.arrayBuffer();
		const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
		const channelData = [];
		for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
			channelData.push(Array.from(audioBuffer.getChannelData(i)));
		}
		return (channelData);
	}

	function validJson(json) {
		try {
			JSON.parse(json);
			return (true)
		} catch (_e) {
			return (false)
		}
	}
	jsNode.connect(gainNode);
	gainNode.connect(ctx.destination);

	if (!Scratch.extensions.unsandboxed) {
		alert("This extension needs to be unsandboxed to run!")
		return
	}

	class Extension {
		getInfo() {
			return {
				"id": "dsp",
				"name": "DSP",
				"color1": "#0088ff",
				"color2": "#0063ba",
				"tbShow": true,
				"blocks": blocks,
				"menus": menus
			}
		}
	}

	blocks.push({
		opcode: "pushSample",
		blockType: Scratch.BlockType.COMMAND,
		text: "push sample [SMP] to channel [CH]",
		arguments: {
			"SMP": {
				type: Scratch.ArgumentType.STRING,
				defaultValue: "0"
			},
			"CH": {
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["pushSample"] = (args) => {
		const smp = args.SMP;
		const ch = args.CH;
		if (!(ch in dchannels)) return;
		if (!isNaN(parseFloat(smp))) {
			dchannels[ch].samples.push(parseFloat(smp));
			return;
		}
		if (validJson(smp) && Array.isArray(JSON.parse(smp))) {
			dchannels[ch].samples.push(...JSON.parse(smp));
			return
		}
	};

	blocks.push({
		opcode: "smpClear",
		blockType: Scratch.BlockType.COMMAND,
		text: "clear buffer for channel [CH]",
		arguments: {
			"SMP": {
				type: Scratch.ArgumentType.NUMBER,
			},
			"CH": {
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["smpClear"] = (args, util) => {
		const ch = args.CH;
		if (!(ch in dchannels)) return;
		dchannels[ch].samples = [];
	};

	blocks.push({
		opcode: "sampleRate",
		blockType: Scratch.BlockType.REPORTER,
		text: "sample rate",
		arguments: {},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["sampleRate"] = () => ctx.sampleRate;

	blocks.push({
		opcode: "getSamplesFrom",
		blockType: Scratch.BlockType.REPORTER,
		text: "samples from url/i [LINK]",
		arguments: {
			"LINK": {
				type: Scratch.ArgumentType.STRING,
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["getSamplesFrom"] = async (args) => {
      try{return getSamples(args.LINK)}
      catch(e) {return ""}
    };

	blocks.push({
		opcode: "newCh",
		blockType: Scratch.BlockType.COMMAND,
		text: "new channel",
		arguments: {
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["newCh"] = () => {
		dchannels.push({
			samples: [],
			pan: 0,
			gain: 0.5,
			stream: true,
			smp: -1,
			loopb: -1,
			inc: 1,
			filter: new Filter()
		})
	};

	blocks.push({
		opcode: "chCount",
		blockType: Scratch.BlockType.REPORTER,
		text: "# of channels",
		arguments: {},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["chCount"] = () => dchannels.length

	blocks.push({
		opcode: "deleteCh",
		blockType: Scratch.BlockType.COMMAND,
		text: "delete channel [CH]",
		arguments: {
			"CH":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			}
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["deleteCh"] = (args) => {
		const ch = args.CH;
		if (!(ch in dchannels)) return
		;
		dchannels.splice(ch, 1);
	}

	blocks.push({
		opcode: "setParem",
		blockType: Scratch.BlockType.COMMAND,
		text: "set [PAREM] to [VAL] for channel [CH]",
		arguments: {
			"PAREM":{
				type: Scratch.ArgumentType.STRING,
				menu: "PAREMS"
			},
			"VAL":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
			"CH":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["setParem"] = (args) => {
		const ch = args.CH;
		if (!(ch in dchannels)) return;
		dchannels[ch][args.PAREM] = args.VAL;
		if (args.PAREM === 'smp') dchannels[ch].inc = 0;
	}

	blocks.push({
		opcode: "getParem",
		blockType: Scratch.BlockType.REPORTER,
		text: "[PAREM] for channel [CH]",
		arguments: {
			"PAREM":{
				type: Scratch.ArgumentType.STRING,
				menu: "PAREMS"
			},
			"CH":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["getParem"] = (args) => {
		const ch = args.CH;
		if (!(ch in dchannels)) return "";
		return dchannels[ch][args.PAREM];
	}

	blocks.push({
		opcode: "setStream",
		blockType: Scratch.BlockType.COMMAND,
		text: "set streaming to [BOOL] for channel [CH]",
		arguments: {
			"BOOL":{
				type: Scratch.ArgumentType.BOOLEAN,
			},
			"CH":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["setStream"] = (args) => {
		const ch = args.CH;
		if (!(ch in dchannels)) return;
		dchannels[ch].stream = args.BOOL;
	}

  blocks.push({
		opcode: "setCoef",
		blockType: Scratch.BlockType.COMMAND,
		text: "set filter coeficents to b0:[B0] b1:[B1] b2:[B2] a1:[A1] a2:[A2] for channel [CH]",
		arguments: {
			"B0":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 1
			},
            "B1":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
            "B2":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
            "A1":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
            "A2":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
			"CH":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["setCoef"] = ({CH, B0, B1, B2, A1, A2}) => {
		const ch = CH;
		if (!(ch in dchannels)) return;
		dchannels[ch].filter.setCoefficients(B0, B1, B2, A1, A2);
	}

  blocks.push({
		opcode: "setLowPass",
		blockType: Scratch.BlockType.COMMAND,
		text: "set lowpass cutoff freq to [FREQ] for channel [CH]",
		arguments: {
			"FREQ":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 1000
			},
			"CH":{
				type: Scratch.ArgumentType.NUMBER,
				defaultValue: 0
			},
		},
		disableMonitor: true,
		isEdgeActivated: false
	});
	Extension.prototype["setLowPass"] = ({CH, FREQ}) => {
		const ch = CH;
		if (!(ch in dchannels)) return;
		dchannels[ch].filter.setLowPass(FREQ);
	}

	Scratch.extensions.register(new Extension());
})(Scratch);