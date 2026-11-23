(function (Scratch) {
  if (!Scratch.extensions.unsandboxed) {
    alert("Patcher must run unsandboxed.");
    return;
  }

  if (!Scratch.extensions.isNitroBolt) {
    alert("This extension only works in NitroBolt.")
    return;
  }

  class Patcher {
    getInfo() {
      return {
        id: "dmnnitropatcher",
        name: "Patching",
        color1: "#d50f7f",
        blocks: [
          {
            opcode: "patch",
            blockType: Scratch.BlockType.COMMAND,
            dualType: Scratch.BlockType.REPORTER,
            allowDropAnywhere: true,
            text: "patch [ROOT] [REST]",
            arguments: {
              ROOT: {
                type: Scratch.ArgumentType.STRING,
                exemptFromNormalization: true
              },
              REST: {
                type: Scratch.ArgumentType.EXTENDABLE,
                text: "[ELE]",
                arguments: {
                  ELE: {
                    type: Scratch.ArgumentType.STRING,
                    exemptfromnormalization: true
                  }
                }
              }
            },
            compiler: (args) => {
              let value
              try {
                value = [JSON.parse(args.ROOT)]
              } catch(_) {
                value = [args.ROOT]
              }
              for(var i = 0; i < args.REST; i++) {
                try {
                  value.push(JSON.parse(args[`REST_${i}_ELE`]))
                } catch(_) {
                  value.push(args[`REST_${i}_ELE`])
                }
              }
              return value.join("")
            }
          },
          {
            opcode: "template",
            blockType: Scratch.BlockType.REPORTER,
            text: "${[ROOT] [REST]}",
            arguments: {
              ROOT: {
                type: Scratch.ArgumentType.STRING,
                exemptFromNormalization: true
              },
              REST: {
                type: Scratch.ArgumentType.EXTENDABLE,
                text: "[ELE]",
                arguments: {
                  ELE: {
                    type: Scratch.ArgumentType.STRING,
                    exemptfromnormalization: true
                  }
                }
              }
            },
            compiler: (args) => {
              let value = [args.ROOT]
              for(var i = 0; i < args.REST; i++) {
                value.push(args[`REST_${i}_ELE`])
              }
              return `\`${value.map((key) => `\${${key}}`).join("")}\``
            }
          }
        ]
      };
    }

    patch() {
      throw("Compiler must be enabled")
    }
    template() {
      throw("Compiler must be enabled")
    }
  }
  Scratch.extensions.register(new Patcher());
})(Scratch)