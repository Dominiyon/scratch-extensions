// lua4scratch

/*
   This extension was made with TurboBuilder!
   https://turbobuilder-steel.vercel.app/
*/
(async function (Scratch) {

  const spCompat = Object.keys(Object.fromEntries(vm.extensionManager._loadedExtensions)).includes("SPadvControl");
  const spInstance = vm.extensionManager._loadedExtensions.get("SPadvControl")?._extensionInstance;
  const variables = {};
  const blocks = [];
  const menus = {};

  const fengariModule = await import('https://cdn.jsdelivr.net/npm/fengari-web@0.1.4/+esm');
  const fengari = fengariModule.default ?? fengariModule;

  if (!Scratch.extensions.unsandboxed) {
    alert("This extension needs to be unsandboxed to run!")
    return
  }

  class LuaState {
    constructor(fengariRef) {
      const fengari = fengariRef || (typeof window !== 'undefined' ? window.fengari : globalThis.fengari);
      if (!fengari) {
        throw new Error("fengari not found! Pass it explicitly with 'new LuaState(fengari)'");
      }

      this.fengari = fengari;
      const { lua, lauxlib, lualib, interop } = fengari;
      this._resumeWaiters = [];
      this.lua = lua;
      this.lauxlib = lauxlib;
      this.lualib = lualib;
      this.OL = lauxlib.luaL_newstate();
      lualib.luaL_openlibs(this.OL);
      this._exposed = new Map();
      this.isLuaState = true;
      interop.luaopen_js(this.OL);
      this.L = lua.lua_newthread(this.OL)
    }

    _str(s) {
      return this.fengari.to_luastring(s);
    }

    _jstr(s) {
      return this.fengari.to_jsstring(s);
    }

    _pushValue(value) {
      const { lua } = this;
      const L = this.L;

      if (value === null || value === undefined) {
        lua.lua_pushnil(L);
      } else if (typeof value === 'boolean') {
        lua.lua_pushboolean(L, value);
      } else if (typeof value === 'number') {
        lua.lua_pushnumber(L, value);
      } else if (typeof value === 'string') {
        lua.lua_pushstring(L, this._str(value));
      } else if (typeof value === 'function') {
        this._pushJsFunction(value);
      } else if (Array.isArray(value)) {
        lua.lua_createtable(L, value.length, 0);
        value.forEach((v, i) => {
          this._pushValue(v);
          lua.lua_rawseti(L, -2, i + 1);
        });
      } else if (typeof value === 'object') {
        lua.lua_createtable(L, 0, 0);
        for (const [k, v] of Object.entries(value)) {
          this._pushValue(v);
          lua.lua_setfield(L, -2, this._str(k));
        }
      } else {
        throw new Error(`Cannot push value of type ${typeof value}`);
      }
    }

    _pushJsFunction(fn) {
      const { lua } = this;
      const L = this.L;
      lua.lua_pushjsfunction(L, (L) => {
        const argc = lua.lua_gettop(L);
        const args = [];
        for (let i = 1; i <= argc; i++) args.push(this._readValue(i));

        const result = fn(...args);

        if (Array.isArray(result) && result.__multi) {
          result.forEach((r) => this._pushValue(r));
          return result.length;
        }
        if (result === undefined) return 0;
        this._pushValue(result);
        return 1;
      });
    }

    _readValue(idx) {
      const { lua } = this;
      const L = this.L;
      const type = lua.lua_type(L, idx);

      switch (type) {
        case lua.LUA_TNIL:
          return null;
        case lua.LUA_TBOOLEAN:
          return lua.lua_toboolean(L, idx);
        case lua.LUA_TNUMBER:
          return lua.lua_tonumber(L, idx);
        case lua.LUA_TSTRING:
          return this._jstr(lua.lua_tostring(L, idx));
        case lua.LUA_TTABLE:
          return this._readTable(idx);
        case lua.LUA_TFUNCTION:
          return this._wrapLuaFunction(idx);
        default:
          return undefined;
      }
    }

    _readTable(idx) {
      const { lua } = this;
      const L = this.L;
      const absIdx = lua.lua_absindex(L, idx);
      const result = {};
      let isArray = true;
      let count = 0;

      lua.lua_pushnil(L);
      while (lua.lua_next(L, absIdx) !== 0) {
        count++;
        const keyType = lua.lua_type(L, -2);
        if (keyType === lua.LUA_TNUMBER) {
          const key = lua.lua_tonumber(L, -2);
          result[key] = this._readValue(-1);
          if (key !== count) isArray = false;
        } else {
          isArray = false;
          const key = this._jstr(lua.lua_tostring(L, -2));
          result[key] = this._readValue(-1);
        }
        lua.lua_pop(L, 1);
      }

      if (isArray && count > 0) {
        const arr = [];
        for (let i = 1; i <= count; i++) arr.push(result[i]);
        return arr;
      }
      return result;
    }

    _wrapLuaFunction(idx) {
      const { lua } = this;
      const L = this.L;
      lua.lua_pushvalue(L, idx);
      const ref = this.lauxlib.luaL_ref(L, lua.LUA_REGISTRYINDEX);
      const self = this;
      return function (...args) {
        lua.lua_rawgeti(L, lua.LUA_REGISTRYINDEX, ref);
        args.forEach((a) => self._pushValue(a));
        const status = lua.lua_pcall(L, args.length, 1, 0);
        if (status !== lua.LUA_OK) {
          const err = self._jstr(lua.lua_tostring(L, -1));
          lua.lua_pop(L, 1);
          throw new Error(`Lua error: ${err}`);
        }
        const result = self._readValue(-1);
        lua.lua_pop(L, 1);
        return result;
      };
    }

    run(code) {
      const status = this.lua.lua_status(this.L);
      if (status === this.lua.LUA_YIELD) {
        throw new Error('Coroutine is suspended; call resume() instead of run()');
      }
      if (status !== this.lua.LUA_OK) {
        this._newThread();
      } else if (this.lua.lua_gettop(this.L) !== 0) {
        this._newThread();
      }

      const top = this.lua.lua_gettop(this.L);
      const loadst = this.lauxlib.luaL_loadstring(this.L, this._str(code));
      if (loadst !== 0) {
        const err = this.lua.lua_tojsstring(this.L, -1);
        this.lua.lua_settop(this.L, top);
        throw new Error(`Load error: ${err}`);
      }

      return this._doResume(0, top);
    }

    resume(...args) {
      if (this.lua.lua_status(this.L) !== this.lua.LUA_YIELD) {
        throw new Error('No suspended coroutine to resume');
      }
      const top = this.lua.lua_gettop(this.L);
      for (const a of args) this._pushValue(a);
      return this._doResume(args.length, top);
    }

    _doResume(nargs, top) {
      const status = this.lua.lua_resume(this.L, this.OL, nargs);
      if (status !== this.lua.LUA_OK && status !== this.lua.LUA_YIELD) {
        const err = this.lua.lua_tojsstring(this.L, -1);
        this.lua.lua_settop(this.L, top);
        const e = new Error(`Lua error: ${err}`);
        this._settleWaiters(e, true);
        throw e;
      }

      const newTop = this.lua.lua_gettop(this.L);
      const results = [];
      for (let i = top + 1; i <= newTop; i++) {
        results.push(this._toJs(i));
      }

      if (status === this.lua.LUA_YIELD) {
        return { yielded: true, values: results, toString() { return "<yielded>" } };
      }

      this.lua.lua_settop(this.L, top);
      const ret = results.length === 0 ? undefined : results.length === 1 ? results[0] : results;
      this._settleWaiters(ret, false);
      return ret;
    }

    _settleWaiters(value, isError) {
      const waiters = this._resumeWaiters;
      this._resumeWaiters = [];
      waiters.forEach(w => isError ? w.reject(value) : w.resolve(value));
    }

    waitForCompletion() {
      if (this.lua.lua_status(this.L) !== this.lua.LUA_YIELD) {
        return Promise.resolve(undefined);
      }
      return new Promise((resolve, reject) => {
        this._resumeWaiters.push({ resolve, reject });
      });
    }

    _newThread() {
      this.L = this.lua.lua_newthread(this.OL);
    }

    _toJs(idx) {
      switch (this.lua.lua_type(this.L, idx)) {
        case this.lua.LUA_TNIL:
          return undefined;
        case this.lua.LUA_TBOOLEAN:
          return this.lua.lua_toboolean(this.L, idx);
        case this.lua.LUA_TNUMBER:
          return this.lua.lua_tonumber(this.L, idx);
        case this.lua.LUA_TSTRING:
          return this.lua.lua_tojsstring(this.L, idx);
        case this.lua.LUA_TTABLE:
          return this._tableToJs(idx);
        default:
          return undefined;
      }
    }

    setGlobal(name, value) {
      this._pushValue(value);
      this.lua.lua_setglobal(this.L, this._str(name));
    }

    getGlobal(name) {
      this.lua.lua_getglobal(this.L, this._str(name));
      const value = this._readValue(-1);
      this.lua.lua_pop(this.L, 1);
      return value;
    }

    call(name, ...args) {
      this.lua.lua_getglobal(this.L, this._str(name));
      args.forEach((a) => this._pushValue(a));

      const status = this.lua.lua_pcall(this.L, args.length, 1, 0);
      if (status !== this.lua.LUA_OK) {
        const err = this._jstr(this.lua.lua_tostring(this.L, -1));
        this.lua.lua_pop(this.L, 1);
        throw new Error(`Lua call error: ${err}`);
      }

      const result = this._readValue(-1);
      this.lua.lua_pop(this.L, 1);
      return result;
    }

    yield() {
      this.lua.lua_yield(this.L, 0)
    }

    expose(name, fn) {
      fn.toString = () => "<js function>"
      this._exposed.set(name, fn);
      this._pushJsFunction(fn);
      this.lua.lua_setglobal(this.L, this._str(name));
    }

    close() {
      this.lua.lua_close(this.L);
      this.L = null;
    }

    toString() {
      return "<lua state>"
    }
  }

  class Extension {
    getInfo() {
      return {
        "id": "dmnlua",
        "name": "Lua",
        "color1": "#000080",
        "color2": "#000060",
        "tbShow": true,
        "blocks": blocks,
        "menus": menus
      }
    }
  }

  menus["yield"] = {
    acceptReporters: false,
    items: [
      { text: 'and continue', value: 0 },
      { text: 'and yield', value: 1 }
    ]
  }

  blocks.push({
    opcode: "load",
    blockType: Scratch.BlockType.REPORTER,
    text: "lua [CODE]",
    arguments: {
      "CODE": {
        type: Scratch.ArgumentType.STRING,
        defaultValue: "return 1+2"
      }
    },
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["load"] = (args) => { return fengari.load(args.CODE)() };

  blocks.push('---');

  blocks.push({
    opcode: "newState",
    blockType: Scratch.BlockType.REPORTER,
    text: "new lua state",
    arguments: {},
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["newState"] = () => { return new LuaState(fengari) };

  blocks.push({
    opcode: "eval",
    blockType: Scratch.BlockType.REPORTER,
    text: "[STATE] run code [CODE]",
    arguments: {
      "STATE": {
        type: "empty"
      },
      "CODE": {
        type: Scratch.ArgumentType.STRING,
        defaultValue: "return 1+2"
      }
    },
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["eval"] = (args) => {
    var state = args.STATE
    if (!(state instanceof LuaState) || !state.L) return;
    return state.run(args.CODE)
  };

  blocks.push({
    opcode: "evalasync",
    blockType: Scratch.BlockType.REPORTER,
    text: "[STATE] run code [CODE] and wait",
    arguments: {
      "STATE": {
        type: "empty"
      },
      "CODE": {
        type: Scratch.ArgumentType.STRING,
        defaultValue: "return 1+2"
      }
    },
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["evalasync"] = async (args) => {
    var state = args.STATE
    if (!(state instanceof LuaState) || !state.L) return;
    const result = state.run(args.CODE);
    if (result && result.yielded) {
      try {
        return await state.waitForCompletion();
      } catch (e) {
        console.error(e);
        return undefined;
      }
    }
    return result;
  };

  blocks.push({
    opcode: "get",
    blockType: Scratch.BlockType.REPORTER,
    text: "[STATE] get variable [NAME]",
    arguments: {
      "STATE": {
        type: "empty"
      },
      "NAME": {
        type: Scratch.ArgumentType.STRING,
      }
    },
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["get"] = (args) => {
    var state = args.STATE
    if (!(state instanceof LuaState) || !state.L) return;
    return state.getGlobal(args.NAME)
  };

  blocks.push({
    opcode: "set",
    blockType: Scratch.BlockType.COMMAND,
    text: "[STATE] set variable [NAME] to [VALUE]",
    arguments: {
      "STATE": {
        type: "empty"
      },
      "NAME": {
        type: Scratch.ArgumentType.STRING,
      },
      "VALUE": {
        type: "empty"
      }
    },
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["set"] = (args) => {
    var state = args.STATE
    if (!(state instanceof LuaState) || !state.L) return;
    return state.setGlobal(args.NAME, args.VALUE)
  };

  blocks.push({
    opcode: "hook",
    blockType: Scratch.BlockType.COMMAND,
    text: "[STATE] hook function [NAME] to broadcast [BC] [YIELD]",
    arguments: {
      "STATE": {
        type: "empty"
      },
      "NAME": {
        type: Scratch.ArgumentType.STRING,
      },
      "BC": {
        type: Scratch.ArgumentType.STRING
      },
      "YIELD": {
        type: Scratch.ArgumentType.NUMBER,
        menu: "yield"
      }
    },
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["hook"] = (args, util) => {
    var state = args.STATE;
    if (!(state instanceof LuaState) || !state.L) return;

    state.expose(args.NAME, (...e) => {
      const threads = util.startHats("event_whenbroadcastreceived", {
        BROADCAST_OPTION: args.BC,
      });
      threads.forEach(thread => {
        thread._luaCallArgs = [...e];
        thread._luaCallState = state;
      });
      if (args.YEILD && threads.length > 0) {
        state.yield()
        return
      }
      return threads.length > 0;
    });
  };

  blocks.push({
    opcode: "hookthread",
    blockType: Scratch.BlockType.COMMAND,
    text: "[STATE] hook function [NAME] to thread function [FNNAME]",
    arguments: {
      "STATE": {
        type: "empty"
      },
      "NAME": {
        type: Scratch.ArgumentType.STRING,
      },
      "FNNAME": {
        type: Scratch.ArgumentType.STRING
      },
    },
    disableMonitor: true,
    isEdgeActivated: false,
    hideFromPallette: spCompat
  });
  Extension.prototype["hookthread"] = (args, util) => {
    var state = args.STATE;
    if (!(state instanceof LuaState) || !state.L) return;

    state.expose(args.NAME, (...e) => {
      if (util.stackFrame.SPran) {
        if (runtime.isActiveThread(util.stackFrame.SPran)) {state.yield(); util.yield();}
        else {
          state.resume(util.stackFrame.SPran.justReported ?? "")
          return;
        };
      } else {
        const func = util.thread[`SPfunction-${args.FNNAME}`];
        if (func === undefined) return "";
        else {
          const thread = this.pushThread(func, util, { stackClick: false });
          this.addMissKeys(util.thread, thread);
          if (thread.SPadvCtrl === undefined) thread.stackFrames[0].SPadvCtrl = e;
          util.stackFrame.SPran = thread;
          util.yield();
          state.yield();
        }
      }
    });
  };

  blocks.push('---');

  blocks.push({
    opcode: "callargs",
    blockType: Scratch.BlockType.REPORTER,
    text: "function arguments",
    arguments: {},
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["callargs"] = (_args, util) => {
    return util.thread._luaCallArgs ?? []
  };

  blocks.push({
    opcode: "callstate",
    blockType: Scratch.BlockType.REPORTER,
    text: "called state",
    arguments: {},
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["callstate"] = (_args, util) => {
    return util.thread._luaCallState ?? false
  };

  blocks.push({
    opcode: "continue",
    blockType: Scratch.BlockType.REPORTER,
    text: "[STATE] resume and send back [VALUE]",
    arguments: {
      "STATE": {
        type: "empty"
      },
      "VALUE": {
        type: "empty"
      }
    },
    disableMonitor: true,
    isEdgeActivated: false
  });
  Extension.prototype["continue"] = (args) => {
    var state = args.STATE;
    if (!(state instanceof LuaState) || !state.L) return;
    return state.resume(args.VALUE)
  };

  Scratch.extensions.register(new Extension());
})(Scratch);
