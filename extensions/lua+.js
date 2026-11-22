(async function(Scratch) {
	const variables = {};
	let fengari = null;
	let lua = null;
	let lauxlib = null;
	let lualib = null;
	let L = null;
	let interop = null;
	let registered = {};
	let localArgs = [];
	let ring = 0;


	if (!Scratch.extensions.unsandboxed) {
		throw new Error("This extension must be run unsandboxed.");
	}

	if (!Scratch.ReturnType) {
		Scratch.ReturnType = Scratch.BlockType;
		// Harmless for non mistwarp mods
	}

	let info = {
		id: "dmnLuaplus",
		name: "Lua",
		color1: "#000080",
		blocks: [{
			opcode: "reset",
			blockType: Scratch.BlockType.COMMAND,
			text: "reset lua state : enable js? [WITHJS]",
			arguments: {
				WITHJS: {
					type: Scratch.ArgumentType.BOOLEAN,
				},
			}
		},
		{
			opcode: "flush",
			blockType: Scratch.BlockType.COMMAND,
			text: "reload fengari"
		},
		"---",
		{
			opcode: "runLua",
			blockType: Scratch.BlockType.COMMAND,
			text: "lua [CODE]",
			arguments: {
				CODE: {
					type: Scratch.ArgumentType.STRING,
				},
			},
		},
		{
			opcode: "runLua_Reporter",
			blockType: Scratch.BlockType.REPORTER,
			text: "lua [CODE]",
			arguments: {
				CODE: {
					type: Scratch.ArgumentType.STRING,
				},
			},
		},
		{
			opcode: "runLua_Boolean",
			blockType: Scratch.BlockType.BOOLEAN,
			text: "lua [CODE]",
			arguments: {
				CODE: {
					type: Scratch.ArgumentType.STRING,
				},
			},
		},
		"---",
		{
			opcode: "table_get",
			blockType: Scratch.BlockType.REPORTER,
			text: "[TABLE] get [KEY]",
			arguments: {
				TABLE: {
					type: 'empty',
				},
				KEY: {
					type: Scratch.ArgumentType.STRING
				}
			},
			compFunc: ({
				TABLE,
				KEY
			}) => `(${TABLE}?.get ? ${TABLE}.get(${KEY}) : null)`
		},
		{
			opcode: "table_set",
			blockType: Scratch.BlockType.COMMAND,
			text: "[TABLE] set [KEY] to [VAL]",
			arguments: {
				TABLE: {
					type: 'empty',
				},
				KEY: {
					type: Scratch.ArgumentType.STRING
				},
				VAL: {
					type: 'empty',
				},
			},
			returnType: Scratch.ReturnType.COMMAND,
			compFunc: ({
				TABLE,
				KEY,
				VAL
			}) => `if (${TABLE}?.set) ${TABLE}.set(${KEY}, ${VAL})`
		},
		{
			opcode: "table_has",
			blockType: Scratch.BlockType.BOOLEAN,
			text: "[TABLE] has [KEY]",
			arguments: {
				TABLE: {
					type: 'empty',
				},
				KEY: {
					type: Scratch.ArgumentType.STRING
				}
			},
			returnType: Scratch.ReturnType.BOOLEAN,
			compFunc: ({
				TABLE,
				KEY
			}) => `(${TABLE}?.has ? ${TABLE}.has(${KEY}) : false)`
		},
		{
			opcode: "table_delete",
			blockType: Scratch.BlockType.COMMAND,
			text: "[TABLE] delete [KEY]",
			arguments: {
				TABLE: {
					type: 'empty',
				},
				KEY: {
					type: Scratch.ArgumentType.STRING
				}
			},
			returnType: Scratch.ReturnType.COMMAND,
			compFunc: ({
				TABLE,
				KEY
			}) => `if (${TABLE}?.delete)  ${TABLE}.delete(${KEY})`
		},
		"---",
		{
			opcode: "inject",
			blockType: Scratch.BlockType.COMMAND,
			text: "inject [VAL] as [KEY]",
			arguments: {
				VAL: {
					type: 'empty',
				},
				KEY: {
					type: Scratch.ArgumentType.STRING
				}
			},
			returnType: Scratch.ReturnType.COMMAND,
			compFunc: ({
				VAL,
				KEY
			}, {
				cast
			}) => `fengari.interop.push(fengari.L, ${VAL}); fengari.lua.lua_setglobal(fengari.L, ${cast.toString(KEY)} ?? "_");`
		},
		{
			opcode: "null_const",
			blockType: Scratch.BlockType.REPORTER,
			text: "null",
			showReporter: false,
			compFunc: () => `null`
		},
		{
			opcode: "undef_const",
			blockType: Scratch.BlockType.REPORTER,
			text: "undefined",
			showReporter: false,
			compFunc: () => `undefined`
		},
		"---",
		{
			opcode: "push",
			blockType: Scratch.BlockType.COMMAND,
			text: "push argument [THING]",
			arguments: {
				THING: {
					type: 'empty'
				}
			},
		},
		{
			opcode: "invoke_rep",
			blockType: Scratch.BlockType.REPORTER,
			text: "invoke [FN] as this=[THIS]",
			arguments: {
				FN: {
					type: 'empty'
				},
				THIS: {
					type: 'empty'
				}
			},
			compFunc: ({ FN, THIS }) => `(_=>{
				try {
					return ${FN}?.invoke ? ${FN}.invoke(${THIS}, target.__luaArgs ?? []) : undefined
				} catch(e) {
					return e.toString()
				} finally {
					target.__luaArgs = []
				}
			})()`
		},
		{
			opcode: "invoke",
			blockType: Scratch.BlockType.COMMAND,
			text: "invoke [FN] as this=[THIS]",
			arguments: {
				FN: {
					type: 'empty'
				},
				THIS: {
					type: 'empty'
				}
			},
			compFunc: ({ FN, THIS }) => `(_=>{try {
					if(${FN}?.invoke) ${FN}.invoke(${THIS}, target.__luaArgs)
				} catch(e) {
					console.error(e)
				} finally {
					target.__luaArgs = []
				}})();`
		},
		{
			opcode: "at",
			blockType: Scratch.BlockType.REPORTER,
			text: "[ARR] at [IDX]",
			arguments: {
				ARR: {
					type: 'empty'
				},
				IDX: {
					type: Scratch.ArgumentType.NUMBER
				}
			},
			compFunc: ({
				ARR,
				IDX
			}) => `((${ARR})?.at ? (${IDX}).at(${IDX}) : undefined)`
		},
		{
			opcode: "size",
			blockType: Scratch.BlockType.REPORTER,
			text: "size of [ANY]",
			arguments: {
				ANY: {
					type: 'empty'
				}
			},
			returnType: Scratch.ReturnType.NUMBER,
			compFunc: ({
				ANY
			}) => `(!isNaN(${ANY}?.length ?? NaN) ? ${ANY}.length : -1)`
		},
		]
	};

	info.blocks.forEach(block => {
		if (block.compFunc) {
			block.compiler = block.compFunc
		}
	})

	async function loadFengari() {
		return new Promise((resolve) => {
			const script = document.createElement("script");
			script.id = "fengariSource"
			script.src = "https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/dist/fengari-web.js";
			script.onload = () => {
				fengari = window.fengari;
				lua = fengari.lua;
				lauxlib = fengari.lauxlib;
				lualib = fengari.lualib;
				interop = fengari.interop;
				L = fengari.L; // use the default Lua state

				resolve();
			};
			let element = document.getElementById("fengariSource");
			if (element) {
				element.remove();
			}
			document.head.appendChild(script);
		});
	}

	class Extension {
		getInfo() {
			return info;
		}

		reset({WITHJS}) {
			lua.lua_close(L);
			L = null;
			L = lauxlib.luaL_newstate();
			lualib.luaL_openlibs(L);
			lauxlib.luaL_requiref(
				L,
				fengari.to_luastring("js"),
				interop.luaopen_js,
				1
			);
			lua.lua_pop(L, 1);
			if (!WITHJS) {
				lua.lua_pushnil(L);
				lua.lua_setglobal(L, fengari.to_luastring("js")); //BEGONE, SATAN! (optional)
			}
		}

		async flush(){
			await loadFengari()
		}

		runLua(args) {
			try {
				const code = args.CODE.replace(/\\n/g, "\n").replace(/\\t/g, "\t");
				const status = lauxlib.luaL_loadstring(L, fengari.to_luastring(code));
				if (status !== lua.LUA_OK) {
					throw new Error(fengari.to_jsstring(lua.lua_tostring(L, -1)));
				}
				lua.lua_pcall(L, 0, 0, 0);
			} catch (e) {
				console.error("Lua Error:", e);
			}
		}

		runLua_Reporter(args) {
			try {
				const code = `
                    function __scratch_return()
                        ${args.CODE}
                    end
                `;
				lauxlib.luaL_loadstring(L, fengari.to_luastring(code));
				lua.lua_pcall(L, 0, 0, 0);
				lua.lua_getglobal(L, fengari.to_luastring("__scratch_return"));
				lua.lua_pcall(L, 0, 1, 0);

				const val = lua.lua_type(L, -1);
				let retVal;

				if (val === lua.LUA_TSTRING) {
					retVal = fengari.to_jsstring(lua.lua_tostring(L, -1));
				} else if (val === lua.LUA_TNUMBER) {
					retVal = lua.lua_tonumber(L, -1);
				} else if (val === lua.LUA_TBOOLEAN) {
					retVal = lua.lua_toboolean(L, -1);
				} else {
					retVal = interop.tojs(L, -1);
				}

				lua.lua_pop(L, 1);
				return retVal;
			} catch (e) {
				console.error("Lua Error:", e);
				return "";
			}
		}

		runLua_Boolean(args) {
			try {
				const code = `
                    function __scratch_return()
                        ${args.CODE}
                    end
                `;
				lauxlib.luaL_loadstring(L, fengari.to_luastring(code));
				lua.lua_pcall(L, 0, 0, 0);
				lua.lua_getglobal(L, fengari.to_luastring("__scratch_return"));
				lua.lua_pcall(L, 0, 1, 0);
				const result = lua.lua_toboolean(L, -1);
				lua.lua_pop(L, 1);
				return result;
			} catch (e) {
				console.error("Lua Error:", e);
				return false;
			}
		}

		table_get(args) {
			return args.TABLE?.get ? args.TABLE.get(args.KEY) : null
		}

		table_set(args) {
			if (args.TABLE?.set) return args.TABLE.set(args.KEY, args.VAL)
		}

		table_has(args) {
			return args.TABLE?.has ? args.TABLE.has(args.KEY) : false
		}

		table_delete(args) {
			if (args.TABLE?.delete) args.TABLE.delete(args.KEY)
		}

		inject(args, util) {
			fengari.interop.push(fengari.L, args.VAL);
			fengari.lua.lua_setglobal(fengari.L, args.KEY ?? "_");
		}

		null_const = () => null
      	undef_const = () => undefined

		push(args, util) {
			if (!util.target.__luaArgs) util.target.__luaArgs = []
			util.target.__luaArgs.push(args.THING)
		}

		invoke(args, util) {
			let result
			if (args.FN?.invoke) result = args.FN.invoke(args.THIS, util.target.__luaArgs ?? [])
			util.target.__luaArgs = []
			return result
		}

		invoke_rep(args, util) {
			let result
			if (args.FN?.invoke) result = args.FN.invoke(args.THIS, util.target.__luaArgs ?? [])
			util.target.__luaArgs = []
			return result
		}
		at(args) {
			let result
			if (args.ARR?.at) result = args.ARR.at(args.IDX)
			return result
		}
		size(args) {
			return !isNaN(args.ANY?.length ?? NaN) ? args.ANY.length : -1
		}
	}

	await loadFengari()
	Scratch.extensions.register(new Extension());
})(Scratch);
