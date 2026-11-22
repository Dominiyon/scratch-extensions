// Name: Jix Runner
// Description: Runs Jix, a hybrid scripting language
// Licence: MIT


(async function (Scratch) {

    if (!Scratch.extensions.unsandboxed) {
        throw new Error('Jix runner must run unsandboxed');
    }

    const Jix = await import('https://unpkg.com/subscript/jessie.min.js');
    const { operator, compile, binary, unary, literal } = Jix

    // put in true/false as literals as they arent default for some reason
    literal('true', true)
    literal('false', false)

    // concat function helper
    function concat(x, y) {
        if ((typeof x === typeof y) && typeof x === 'string') {
            return `${x}${y}`
        } else if ((typeof x === typeof y) && typeof x === 'object') {
            if (Array.isArray(x) && Array.isArray(y)) return [...x, ...y]
            else return { ...x, ...y }
        } else { throw (`TypeError: Cannot concat types ${typeof x} and ${typeof y}`) }
    }
    // force addition to be numeric
    operator("+", (x, y) => (
        x = compile(x), y = compile(y),
        ctx => +x(ctx) + +y(ctx)
    ))
    // concat
    binary("..", 130)
    operator("..", (a, y) => (
        a = compile(a), y = compile(y),
        ctx => {
            console.log(a);
            a = a(ctx); y = y(ctx);
            return concat(a, y)
        }
    ))
    //length
    unary("#")
    operator("#", (x) => (
        x = compile(x),
        ctx => x(ctx).length
    ))

    //string
    unary("$")
    operator("$", (x) => (
        x = compile(x),
        ctx => `${x(ctx)}`
    ))
    let __self
    const builtin = {
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        sqrt: Math.sqrt,
        rand: Math.random,
        int: Math.round,
        abs: Math.abs,
        floor: Math.floor,
        ceil: Math.ceil,
        min: Math.min,
        max: Math.max,
        atan2: Math.atan2,
        isNaN: isNaN,
        log: console.log,
        assert: (x, msg = "") => {
            if (x) { return (x) }
            else { throw (`Assertion failed${msg ? ": " + msg : ""}`) }
        },
        pairs: Object.entries,
        keys: Object.keys,
        values: Object.values,
        encode: JSON.stringify,
        decode: JSON.parse,
        get me() { return __self }
    }

    __self = { ...builtin }

    function execute(code, env) {
        return Jix.compile(Jix.parse(code))(env)
    }

    window.JixRunner = {Jix, execute, __self, builtin};

    class Extension {
        /** @returns {Scratch.Info} */
        getInfo() {
            return {
                "id": "dmnjix",
                "name": "Jix",
                "color1": "#0088ff",
                "blocks": [
                    {
                        opcode: "jessie",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "execute [CODE]",
                        arguments: {
                            "CODE": {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: ``
                            },

                        },
                        disableMonitor: true
                    },
                    {
                        opcode: "set",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "inject [ANY] as [VAR]",
                        arguments: {
                            "ANY": {
                                type: "empty",
                                defaultValue: ``
                            },
                            "VAR": {
                                type: Scratch.ArgumentType.STRING,
                                defaultValue: ``
                            },
                        },
                    },
                    {
                        opcode: "save",
                        blockType: Scratch.BlockType.REPORTER,
                        text: "get env",
                        arguments: {},
                        disableMonitor: true
                    },
                    {
                        opcode: "restore",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "restore env from [ENV]",
                        arguments: {
                            "ENV": {
                                type: "empty",
                                defaultValue: ``
                            }
                        },
                    },
                    {
                        opcode: "reset",
                        blockType: Scratch.BlockType.COMMAND,
                        text: "reset env",
                        arguments: {},
                    },
                ],
            }
        }

        jessie({ CODE }) {
            return execute(CODE, JixRunner.__self)
        };

        set({ ANY, VAR }) {
            __self[VAR] = ANY
        };

        save() {
          return __self
        };

        restore({ ENV }) {
          __self = ENV
        };

        reset () {
          __self = { ...builtin }
        };
    }

    if (Scratch.vm.exports.compiler) {
        Scratch.vm.exports.compiler.register('dmnjix', {
            jessie: {
                type: "any",
                compile: ({ input }) => `JixRunner.execute(${input.string('CODE')}, JixRunner.__self)`
            },
        
            set: {
                type: "command",
                compile: ({ input }) => `JixRunner.__self[${input.string('VAR')}]=${input('ANY')}`
            },
        
            save: {
                type: "any",
                compile: () => `{...JixRunner.__self}`
            },
        
            restore: {
                type: "command",
                compile: ({ input }) => `JixRunner.__self = ${input('ENV')}`
            },
        
            reset: {
                type: "command",
                compile: () => `JixRunner.__self = {...JixRunner.builtin}`
            },
        });
    }
    
    Scratch.extensions.register(new Extension());
})(Scratch);
