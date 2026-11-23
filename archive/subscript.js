(async function(Scratch) {
    const variables = {};
    const blocks = [];
    const menus = {};
  
    if (!Scratch.extensions.unsandboxed) {
        alert("This extension needs to be unsandboxed to run!")
        return
    }

    class Extension {
        getInfo() {
            return {
                "id": "dmnSubscript",
                "name": "Subscript",
                "color1": "#c4bc00",
                "color2": "#8d8602",
                "blocks": blocks,
                "menus": menus
            }
        }
    }
    let sucess = false;
    let result = "";
    const Subscript = await import("https://unpkg.com/subscript@10.8.1/feature/subscript.js");
    const {codegen} = await import("https://unpkg.com/subscript@10.8.1/util/stringify.js");

    blocks.push({
        opcode: "parse",
        blockType: Scratch.BlockType.COMMAND,
        text: "parse [STR]",
        arguments: {
            "STR": {
                type: Scratch.ArgumentType.STRING,
            },
        },
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["parse"] = (args) => {
        try {
            result = Subscript.parse(args.STR);
            sucess = true
        } catch (e) {
            result = e.toString();
            sucess = false
        };
    };

    blocks.push({
        opcode: "parseSucess",
        blockType: Scratch.BlockType.BOOLEAN,
        text: "parse suceeded",
        arguments: {},
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["parseSucess"] = () => sucess

    blocks.push({
        opcode: "parseResult",
        blockType: Scratch.BlockType.REPORTER,
        text: "result",
        arguments: {},
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["parseResult"] = () => result
    
    blocks.push("---");
    
    blocks.push({
        opcode: "typeOf",
        blockType: Scratch.BlockType.REPORTER,
        text: "type of [THING]",
        arguments: {
          "THING": {
            type: "empty"
          }
        },
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["typeOf"] = (args) => {
        return args.THING === null ? 'null' : typeof args.THING; //stupid js bug
    };
  
    blocks.push({
        opcode: "sizeOf",
        blockType: Scratch.BlockType.REPORTER,
        text: "size of [THING]",
        arguments: {
          "THING": {
            type: "empty"
          }
        },
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["sizeOf"] = (args) => {
        try{
          return args.THING.length
        } catch(e) {
          return -1
        }
    };
    
    blocks.push({
        opcode: "constNull",
        blockType: Scratch.BlockType.REPORTER,
        text: "null",
        arguments: {},
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["constNull"] = () => null;
    
    blocks.push({
        opcode: "constUndef",
        blockType: Scratch.BlockType.REPORTER,
        text: "undefined",
        arguments: {},
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["constUndef"] = () => undefined;
    
    blocks.push({
        opcode: "strictEq",
        blockType: Scratch.BlockType.BOOLEAN,
        text: "[X]===[Y]",
        arguments: {
          "X": {
            type: "empty"
          },
          "Y": {
            type: "empty"
          }
        },
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["strictEq"] = (args) => {
        return args.X === args.Y;
    };
    
    blocks.push("---");
    
    blocks.push({
        opcode: "toJson",
        blockType: Scratch.BlockType.REPORTER,
        text: "to JSON [OBJ]",
        arguments: {
            "OBJ": {
                type: "empty",
            },
        },
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["toJson"] = (args) => {
        try {
            return JSON.stringify(args.OBJ)
        } catch (e) {
            return ""
        };
    };
    
    blocks.push({
        opcode: "getNode",
        blockType: Scratch.BlockType.REPORTER,
        text: "[OBJ] get [KEY]",
        arguments: {
            "OBJ": {
                type: "empty",
            },
            "KEY": {
                type: Scratch.ArgumentType.NUMBER,
            },
        },
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["getNode"] = (args) => {
        return Array.isArray(args.OBJ) ? args.OBJ[args.KEY] : undefined
    };
  
    blocks.push({
        opcode: "codegen",
        blockType: Scratch.BlockType.REPORTER,
        text: "turn [OBJ] to code",
        arguments: {
            "OBJ": {
                type: "empty",
            }
        },
        disableMonitor: true,
        isEdgeActivated: false
    });
    Extension.prototype["codegen"] = (args) => {
        try {return(codegen(args.OBJ))} catch(e) {return undefined}
    };

    Scratch.extensions.register(new Extension());
})(Scratch);
